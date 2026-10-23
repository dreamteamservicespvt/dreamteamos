import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

/**
 * "Move to" (owner, 2026-10-23), on the in-memory Firestore with the REAL service and the real list.
 *
 * Srinu pasted 8 accounts Bhanu had opened, so they were his — in his target. Assign only changes who
 * uses an account; nothing could change whose it is. The tech admin now ticks the accounts (or "Select
 * all shown" on a filter) and moves them in one click: owner AND holder become the chosen person.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_n: { userId: string; title: string }) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const fc = await import("@/utils/flowCredits");
const { default: FlowAccountsList } = await import("@/components/ai-accounts/FlowAccountsList");
import type { FlowAccount } from "@/types/aiAccounts";

configure({ testIdAttribute: "data-test" });

const S = fc.DEFAULT_FLOW_SETTINGS;
const srinu = { uid: "admin", name: "Srinu", role: "tech_admin", createdBy: "" } as const;
const bhanu = { uid: "bhanu", name: "Bhanu Bezawada", role: "tech_member" } as const;
const account = (id: string) => ({ ...(mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount), id });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T10:00:00"));
  mem.__reset();
  sendNotification.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function pasteTwo() {
  await svc.importFlowAccount({ email: "chandana.mallela.2006.6065@gmail.com", password: "x1" }, srinu, S);
  await svc.importFlowAccount({ email: "rohith.jupudi.2005.0893@gmail.com", password: "x2" }, srinu, S);
  return [account("chandana.mallela.2006.6065@gmail.com"), account("rohith.jupudi.2005.0893@gmail.com")];
}

describe("moveFlowAccounts", () => {
  it("makes the chosen person owner AND holder, keeps a history line and tells her once", async () => {
    const pasted = await pasteTwo();
    expect(pasted[0].ownerId).toBe("admin");
    // One of them has a Gemini key — its record follows the owner.
    mem.__seed("gemini_api_keys/rohith.jupudi.2005.0893@gmail.com", { key: "k", ownerId: "admin", ownerName: "Srinu" });
    pasted[1].apiKey = { fingerprint: "f", status: "working", addedAt: 1, addedByName: "Srinu" } as FlowAccount["apiKey"];

    const n = await svc.moveFlowAccounts(pasted, bhanu, srinu);

    expect(n).toBe(2);
    for (const a of pasted) {
      const after = account(a.id);
      expect([after.ownerId, after.ownerName, after.holderId, after.holderName]).toEqual(["bhanu", "Bhanu Bezawada", "bhanu", "Bhanu Bezawada"]);
      expect(after.visibleTo).toContain("bhanu");
      expect(after.addedBy).toBe("admin"); // who typed it in stays true
      expect(after.history?.at(-1)).toMatchObject({ action: "moved", fromId: "admin", fromName: "Srinu", toId: "bhanu", byName: "Srinu" });
    }
    expect(mem.__read("gemini_api_keys/rohith.jupudi.2005.0893@gmail.com")).toMatchObject({ ownerId: "bhanu", ownerName: "Bhanu Bezawada", key: "k" });
    // Bhanu told once with the count; Srinu moved them himself, so he is not told.
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0]).toMatchObject({ userId: "bhanu", title: "2 Flow accounts moved to you" });
    // Her target counts them now, his does not.
    const [summary] = fc.memberSummaries(pasted.map((a) => account(a.id)), [{ uid: "bhanu", name: "Bhanu Bezawada" }] as never, S, "2026-10-23");
    expect(summary.added).toBe(2);
  });

  it("moving accounts that are already hers changes nothing", async () => {
    const pasted = await pasteTwo();
    await svc.moveFlowAccounts(pasted, bhanu, srinu);
    sendNotification.mockClear();
    const again = await svc.moveFlowAccounts(pasted.map((a) => account(a.id)), bhanu, srinu);
    expect(again).toBe(0);
    expect(account(pasted[0].id).history?.filter((e) => e.action === "moved")).toHaveLength(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("tells the previous owner when someone else moves her accounts", async () => {
    await svc.importFlowAccount({ email: "meghana.rao.2005.7200@gmail.com", password: "x" }, srinu, S);
    await svc.moveFlowAccounts([account("meghana.rao.2005.7200@gmail.com")], bhanu, srinu);
    sendNotification.mockClear();
    const ravi = { uid: "ravi", name: "Ravi", role: "tech_member" } as const;
    await svc.moveFlowAccounts([account("meghana.rao.2005.7200@gmail.com")], ravi, srinu);
    expect(sendNotification.mock.calls.map((c) => (c[0] as { userId: string }).userId).sort()).toEqual(["bhanu", "ravi"]);
  });
});

describe("FlowAccountsList tick boxes", () => {
  function Harness({ accounts }: { accounts: FlowAccount[] }) {
    const [ids, setIds] = useState<string[]>([]);
    return (
      <>
        <p data-test="picked">{ids.slice().sort().join(",")}</p>
        <FlowAccountsList accounts={accounts} viewerId="admin" manager keyAdmin onAction={() => undefined} emptyText="none"
          selection={{ ids, onChange: setIds }} />
      </>
    );
  }

  it("ticks one, then all shown, then none", async () => {
    const pasted = await pasteTwo();
    render(<Harness accounts={pasted} />);
    fireEvent.click(screen.getAllByTestId("flow-select")[0]);
    expect(screen.getByTestId("picked").textContent).toBe(pasted[0].id);
    fireEvent.click(screen.getByTestId("flow-select-shown"));
    expect(screen.getByTestId("picked").textContent).toBe(pasted.map((a) => a.id).sort().join(","));
    fireEvent.click(screen.getByTestId("flow-select-shown"));
    expect(screen.getByTestId("picked").textContent).toBe("");
  });

  it("shows no tick boxes without a selection (members, team leaders)", async () => {
    const pasted = await pasteTwo();
    render(<FlowAccountsList accounts={pasted} viewerId="admin" manager onAction={() => undefined} emptyText="none" />);
    expect(screen.queryByTestId("flow-select")).toBeNull();
    expect(screen.queryByTestId("flow-select-shown")).toBeNull();
  });

  it("shows a moved account's history line", async () => {
    const pasted = await pasteTwo();
    await svc.moveFlowAccounts([pasted[0]], bhanu, srinu);
    render(<FlowAccountsList accounts={[account(pasted[0].id)]} viewerId="admin" manager onAction={() => undefined} emptyText="none" />);
    fireEvent.click(screen.getByText("History"));
    expect(screen.getByTestId("flow-history").textContent).toContain("Srinu moved it from Srinu to Bhanu Bezawada (owner)");
  });
});
