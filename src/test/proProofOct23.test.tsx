import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Pro proof (owner, 2026-10-23): every Flow account carries a screenshot of myaccount.google.com (the Pro
 * badge + the full email), the tech admin or a team leader confirms it or sends it back, and every screen
 * shows how many are not sent / waiting / confirmed / sent back — by member.
 *
 * The rules (utils/proProof), the REAL service on the in-memory Firestore, and the real components.
 * The upload (Cloudinary) and the screenshot reader (Gemini) are faked — never called for real here.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_n: { userId: string; title: string; dedupeKey?: string }) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
const uploadToCloudinary = vi.fn(async (_f: File) => "https://res.cloudinary.com/x/proof.png");
vi.mock("@/services/cloudinary", () => ({ uploadToCloudinary }));
const geminiReply = vi.fn(async (): Promise<{ text: string }> => ({ text: "{}" }));
vi.mock("@/services/geminiService", () => ({ callGeminiWithFallback: async () => geminiReply() }));
vi.mock("@/utils/fileHelpers", () => ({ fileToBase64: async () => "AAAA" }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const pp = await import("@/utils/proProof");
const { default: FlowAccountsList } = await import("@/components/ai-accounts/FlowAccountsList");
const { default: ProProofPanel } = await import("@/components/ai-accounts/ProProofPanel");
const { default: ProProofDialog } = await import("@/components/ai-accounts/ProProofDialog");
import type { FlowAccount, ProProof } from "@/types/aiAccounts";

configure({ testIdAttribute: "data-test" });

const srinu = { uid: "admin", name: "Srinu", role: "tech_admin", createdBy: "" } as const;
const leader = { uid: "lead", name: "Kiran", role: "tech_team_leader", createdBy: "admin" } as const;
const affreen = { uid: "aff", name: "affreen shaik", role: "tech_member", createdBy: "admin" } as const;
const bhanu = { uid: "bhanu", name: "Bhanu", role: "tech_member", createdBy: "admin" } as const;

function seedAccount(email: string, owner: { uid: string; name: string } = affreen, extra: Partial<FlowAccount> = {}): FlowAccount {
  const a = {
    email, phone: "9542169451", createdOn: "2026-10-16", expiresOn: "2028-04-16", monthlyCredits: 1000,
    addedBy: owner.uid, addedByName: owner.name, addedByRole: "tech_member", ownerId: owner.uid, ownerName: owner.name,
    holderId: owner.uid, holderName: owner.name, visibleTo: [owner.uid], teamAdminId: "admin", status: "active", history: [], ...extra,
  };
  mem.__seed(`flow_accounts/${email}`, a as never);
  return { ...(a as unknown as FlowAccount), id: email };
}
const stored = (id: string) => ({ ...(mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount), id });
const proof = (p: Partial<ProProof>): ProProof => ({
  status: "submitted", imageUrl: "https://x/p.png", imageHash: "h", submittedAt: 1, submittedById: "aff", submittedByName: "affreen shaik", ...p,
});
const shot = (name = "shot.png") => new File([new Uint8Array([1, 2, 3, name.length])], name, { type: "image/png" });

beforeEach(() => {
  mem.__reset();
  sendNotification.mockClear();
  uploadToCloudinary.mockClear();
  geminiReply.mockReset();
  geminiReply.mockResolvedValue({ text: "{}" });
});
afterEach(() => cleanup());

describe("the rules", () => {
  it("Gmail emails match ignoring dots, capitals and +tags; other domains as written", () => {
    expect(pp.sameEmail("Chaitanya.Rao.2006.6157@gmail.com", "chaitanyarao20066157@gmail.com")).toBe(true);
    expect(pp.sameEmail("a.b@company.in", "ab@company.in")).toBe(false);
    expect(pp.sameEmail("", "")).toBe(false);
  });

  it("reads the reader's reply into a verdict for THIS account — never a match it cannot see", () => {
    const me = "aishwaryamekala4@gmail.com";
    expect(pp.proProofReadingFrom('```json\n{"email":"AishwaryaMekala4@gmail.com","pro":true,"accountPage":true}\n```', me))
      .toMatchObject({ verdict: "match", pro: true, accountPage: true });
    expect(pp.proProofReadingFrom('{"email":"alludusomalingam@gmail.com","pro":true}', me))
      .toMatchObject({ verdict: "mismatch", note: "Shows another email: alludusomalingam@gmail.com" });
    expect(pp.proProofReadingFrom(`{"email":"${me}","pro":false}`, me)).toMatchObject({ verdict: "mismatch", note: "No Pro badge in the picture." });
    // The Gemini menu cuts the email: "thedreamteamservicespvt@gm…" — not readable, so unclear.
    expect(pp.proProofReadingFrom('{"email":"","pro":true}', me).verdict).toBe("unclear");
    expect(pp.proProofReadingFrom(`{"email":"${me}"}`, me).verdict).toBe("unclear");
    expect(pp.proProofReadingFrom("sorry, I cannot", me).verdict).toBe("unclear");
    expect(pp.proProofReadingFrom(`{"email":"${me}","pro":true,"accountPage":false}`, me).note).toMatch(/not the Google Account page/);
  });

  it("counts by state, leaving disabled accounts out, and ranks members with the most to do first", () => {
    const accounts = [
      { ...seedAccount("a1@gmail.com"), proProof: proof({ status: "confirmed" }) },
      { ...seedAccount("a2@gmail.com") },
      { ...seedAccount("a3@gmail.com"), proProof: proof({ status: "rejected", reason: "x" }) },
      { ...seedAccount("a4@gmail.com"), status: "disabled" as const },
      { ...seedAccount("b1@gmail.com", bhanu), proProof: proof({ status: "submitted" }) },
    ];
    expect(pp.proProofCounts(accounts)).toEqual({ total: 4, none: 1, submitted: 1, confirmed: 1, rejected: 1, sent: 3 });
    const rows = pp.memberProProofRows(accounts);
    expect(rows.map((r) => [r.name, r.total, r.none, r.rejected, r.confirmed])).toEqual([["affreen shaik", 3, 1, 1, 1], ["Bhanu", 1, 0, 0, 0]]);
    // Sent back first, then never sent; disabled and others' accounts left out.
    expect(pp.proProofToSend(accounts, "aff").map((a) => a.email)).toEqual(["a3@gmail.com", "a2@gmail.com"]);
  });

  it("the reviewer's queue puts flagged proofs first, then the oldest", () => {
    const accounts = [
      { ...seedAccount("old@gmail.com"), proProof: proof({ submittedAt: 1 }) },
      { ...seedAccount("new@gmail.com"), proProof: proof({ submittedAt: 5 }) },
      { ...seedAccount("odd@gmail.com"), proProof: proof({ submittedAt: 9, reading: { verdict: "mismatch", email: "x@gmail.com", pro: true, accountPage: true, note: "" } }) },
      { ...seedAccount("done@gmail.com"), proProof: proof({ status: "confirmed" }) },
    ];
    expect(pp.proProofReviewQueue(accounts).map((a) => a.email)).toEqual(["odd@gmail.com", "old@gmail.com", "new@gmail.com"]);
  });

  it("members send until it is confirmed; only a reviewer replaces a confirmed proof", () => {
    const mine = seedAccount("m@gmail.com");
    expect(pp.canSendProProof(affreen, mine)).toBe(true);
    expect(pp.canSendProProof(bhanu, mine)).toBe(false);
    const confirmed = { ...mine, proProof: proof({ status: "confirmed" }) };
    expect(pp.canSendProProof(affreen, confirmed)).toBe(false);
    expect(pp.canSendProProof(leader, confirmed)).toBe(true);
    expect(pp.canReviewProProof(affreen)).toBe(false);
    expect(pp.proProofPageUrl("a.b@gmail.com")).toBe("https://myaccount.google.com/?authuser=a.b%40gmail.com");
  });
});

describe("the service", () => {
  it("prepares a proof: uploads it, reads it, and catches the same picture sent for another account", async () => {
    const other = { ...seedAccount("other@gmail.com"), proProof: proof({ imageHash: await svc.fileSha256(shot("same.png")) }) };
    const mine = seedAccount("mine@gmail.com");
    geminiReply.mockResolvedValue({ text: '{"email":"mine@gmail.com","pro":true,"accountPage":true}' });
    const prepared = await svc.prepareProProof(shot("same.png"), mine, [other, mine]);
    expect(prepared.imageUrl).toBe("https://res.cloudinary.com/x/proof.png");
    expect(prepared.reading.verdict).toBe("match");
    expect(prepared.imageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared.duplicate?.email).toBe("other@gmail.com");
  });

  it("a reader that fails leaves the proof 'not read by the app' — it can still be sent", async () => {
    geminiReply.mockRejectedValue(new Error("No API keys configured"));
    const prepared = await svc.prepareProProof(shot(), seedAccount("k@gmail.com"), []);
    expect(prepared.reading.verdict).toBe("unchecked");
  });

  it("submit → confirm: stored with who and when, history kept, a stale view cannot decide", async () => {
    const a = seedAccount("x@gmail.com");
    const prepared = { imageUrl: "https://x/1.png", imageHash: "h1", reading: pp.UNCHECKED_READING, duplicate: null };
    await svc.submitProProof(a, prepared, affreen);
    const sent = stored(a.id);
    expect(sent.proProof).toMatchObject({ status: "submitted", imageUrl: "https://x/1.png", submittedById: "aff", submittedByName: "affreen shaik" });
    expect(sent.history?.at(-1)).toMatchObject({ action: "pro_proof_sent", byName: "affreen shaik" });

    await expect(svc.reviewProProof(sent, "confirm", leader, { seenAt: sent.proProof!.submittedAt - 1 })).rejects.toThrow(/new screenshot/);
    await expect(svc.reviewProProof(sent, "confirm", affreen, { seenAt: sent.proProof!.submittedAt })).rejects.toThrow(/Only the tech admin/);
    await svc.reviewProProof(sent, "confirm", leader, { seenAt: sent.proProof!.submittedAt });
    const done = stored(a.id);
    expect(done.proProof).toMatchObject({ status: "confirmed", reviewedByName: "Kiran", imageUrl: "https://x/1.png" });
    expect(done.history?.at(-1)).toMatchObject({ action: "pro_confirmed", byName: "Kiran" });
    expect(sendNotification).not.toHaveBeenCalled();

    // The member cannot swap the picture behind the confirmation; a reviewer can.
    await expect(svc.submitProProof(done, prepared, affreen)).rejects.toThrow(/already confirmed Pro/);
    await svc.submitProProof(done, { ...prepared, imageUrl: "https://x/2.png" }, srinu);
    expect(stored(a.id).proProof).toMatchObject({ status: "submitted", imageUrl: "https://x/2.png", submittedByName: "Srinu" });
  });

  it("send back needs a reason and tells the account's owner once, then a new proof clears the reason", async () => {
    const a = seedAccount("y@gmail.com");
    await svc.submitProProof(a, { imageUrl: "u", imageHash: "", reading: pp.UNCHECKED_READING, duplicate: null }, affreen);
    const sent = stored(a.id);
    await expect(svc.reviewProProof(sent, "send_back", srinu, { seenAt: sent.proProof!.submittedAt })).rejects.toThrow(/Say why/);
    await svc.reviewProProof(sent, "send_back", srinu, { seenAt: sent.proProof!.submittedAt, reason: pp.SEND_BACK_REASONS[1] });
    expect(stored(a.id).proProof).toMatchObject({ status: "rejected", reason: pp.SEND_BACK_REASONS[1], reviewedByName: "Srinu" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ userId: "aff", title: "Send the Pro proof again", dedupeKey: `pro_sent_back_y@gmail.com_${sent.proProof!.submittedAt}_aff` });

    await svc.submitProProof(stored(a.id), { imageUrl: "u2", imageHash: "", reading: pp.UNCHECKED_READING, duplicate: null }, affreen);
    expect(stored(a.id).proProof?.status).toBe("submitted");
    expect(stored(a.id).proProof?.reason).toBeUndefined();
  });
});

describe("the screens", () => {
  it("each card shows its Pro proof state; members send, managers check", () => {
    const accounts = [
      seedAccount("none@gmail.com"),
      { ...seedAccount("wait@gmail.com"), proProof: proof({}) },
      { ...seedAccount("back@gmail.com"), proProof: proof({ status: "rejected", reason: "No Pro badge", reviewedByName: "Srinu" }) },
    ];
    const onAction = vi.fn();
    const { unmount } = render(<FlowAccountsList accounts={accounts} viewerId="aff" manager={false} onAction={onAction} emptyText="" />);
    expect(screen.getAllByTestId("flow-pro-proof-status").map((e) => e.textContent)).toEqual(["Not sent", "Waiting for check", "Sent back"]);
    expect(screen.getByTestId("flow-pro-proof-reason").textContent).toBe("Sent back by Srinu: No Pro badge");
    const sends = screen.getAllByTestId("flow-pro-proof-send");
    expect(sends.map((b) => b.textContent?.trim())).toEqual(["Send proof", "Send again"]);
    fireEvent.click(sends[0]);
    expect(onAction).toHaveBeenCalledWith("proof", expect.objectContaining({ id: "none@gmail.com" }));
    expect(screen.queryByTestId("flow-pro-proof-check")).toBeNull();
    unmount();

    // A fourth account — the search and filter show from four accounts up.
    render(<FlowAccountsList accounts={[...accounts, seedAccount("four@gmail.com")]} viewerId="lead" manager onAction={onAction} emptyText="" />);
    fireEvent.click(screen.getByTestId("flow-pro-proof-check"));
    expect(onAction).toHaveBeenLastCalledWith("proofReview", expect.objectContaining({ id: "wait@gmail.com" }));
    // The filter finds them by state.
    fireEvent.change(screen.getByTestId("flow-filter"), { target: { value: "proof_rejected" } });
    expect(screen.getAllByTestId("flow-account-card")).toHaveLength(1);
  });

  it("the Pro proof tab: the counts, each member, and checking proofs one after another", async () => {
    seedAccount("a1@gmail.com");
    seedAccount("a2@gmail.com", affreen, { proProof: proof({ submittedAt: 10 }) } as Partial<FlowAccount>);
    seedAccount("b1@gmail.com", bhanu, { proProof: proof({ submittedAt: 20, submittedById: "bhanu", submittedByName: "Bhanu" }) } as Partial<FlowAccount>);
    seedAccount("b2@gmail.com", bhanu, { proProof: proof({ status: "confirmed" }) } as Partial<FlowAccount>);
    const live = () => ["a1@gmail.com", "a2@gmail.com", "b1@gmail.com", "b2@gmail.com"].map(stored);

    const view = render(<ProProofPanel accounts={live()} actor={srinu} onSend={() => undefined} />);
    expect(screen.getByTestId("pro-proof-confirmed").textContent).toBe("1");
    expect(["none", "submitted", "confirmed", "rejected"].map((t) => screen.getByTestId(`pro-proof-tile-${t}`).textContent))
      .toEqual(["Not sent1", "Waiting for check2", "Pro confirmed1", "Sent back0"]);
    expect(screen.getAllByTestId("pro-proof-member-row").map((r) => r.textContent)).toEqual(["affreen shaik211100", "Bhanu220110"]);

    fireEvent.click(screen.getByTestId("pro-proof-start"));
    expect(screen.getByTestId("pro-review-email").textContent).toBe("a2@gmail.com");
    await act(async () => { fireEvent.click(screen.getByTestId("pro-review-confirm")); });
    view.rerender(<ProProofPanel accounts={live()} actor={srinu} onSend={() => undefined} />);
    expect(stored("a2@gmail.com").proProof?.status).toBe("confirmed");
    // On to the next by itself; S opens the reasons, a reason sends it back.
    expect(screen.getByTestId("pro-review-email").textContent).toBe("b1@gmail.com");
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.click(screen.getByText(pp.SEND_BACK_REASONS[0]));
    await act(async () => { fireEvent.click(screen.getByTestId("pro-review-send-back")); });
    view.rerender(<ProProofPanel accounts={live()} actor={srinu} onSend={() => undefined} />);
    expect(stored("b1@gmail.com").proProof).toMatchObject({ status: "rejected", reason: pp.SEND_BACK_REASONS[0] });
    expect(screen.getByTestId("pro-review-done")).toBeTruthy();
  });

  it("the send dialog reads the picture first and makes a flagged one a deliberate choice", async () => {
    const mine = seedAccount("mine@gmail.com");
    geminiReply.mockResolvedValue({ text: '{"email":"someoneelse@gmail.com","pro":true,"accountPage":true}' });
    const onSent = vi.fn();
    render(<ProProofDialog open account={mine} accounts={[mine]} actor={affreen} onClose={() => undefined} onSent={onSent} />);
    expect(screen.getByTestId("pro-proof-open").getAttribute("href")).toBe("https://myaccount.google.com/?authuser=mine%40gmail.com");
    expect((screen.getByTestId("pro-proof-send") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { fireEvent.change(screen.getByTestId("pro-proof-file"), { target: { files: [shot()] } }); });
    await waitFor(() => expect(screen.getByTestId("pro-proof-reading").textContent).toMatch(/Shows another email: someoneelse@gmail.com/));
    expect((screen.getByTestId("pro-proof-send") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("pro-proof-anyway"));
    await act(async () => { fireEvent.click(screen.getByTestId("pro-proof-send")); });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ id: "mine@gmail.com" }), false);
    expect(stored("mine@gmail.com").proProof).toMatchObject({ status: "submitted", reading: { verdict: "mismatch" } });
  });
});
