import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Gemini API keys on the Flow accounts (2026-10-10), end to end against an in-memory Firestore and a fake
 * Google: a member adds the key made in each account they opened (checked with Google first, the same
 * key refused twice, "Save & next" through the rest), and the tech admin — alone — lists them by person,
 * copies a set, downloads it as a .env for Vercel, marks keys in use, checks them, and removes one.
 */

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));
vi.mock("@/services/firebase", () => ({ db: {} }));
const sendNotification = vi.fn(async (_p: Record<string, unknown>) => undefined);
vi.mock("@/services/notifications", () => ({ sendNotification }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const mem = await import("./memoryFirestore");
const svc = await import("@/services/aiAccounts");
const { useAuthStore } = await import("@/store/authStore");
const { DEFAULT_FLOW_SETTINGS } = await import("@/utils/flowCredits");
const { apiKeyFingerprint } = await import("@/utils/geminiKeys");
const { default: MyAiAccounts } = await import("@/pages/tech-member/MyAiAccounts");
const { default: AiAccounts } = await import("@/pages/shared/AiAccounts");
import type { FlowAccount, GeminiApiKey } from "@/types/aiAccounts";
import type { AppUser } from "@/types";

configure({ testIdAttribute: "data-test" });

const S = DEFAULT_FLOW_SETTINGS;
const admin = { uid: "admin", name: "Kiran (CTO)", role: "tech_admin", createdBy: "main" } as const;
const leader = { uid: "lead", name: "Sravani", role: "tech_team_leader", createdBy: "admin" } as const;
const ravi = { uid: "ravi", name: "Ravi", role: "tech_member", createdBy: "admin" } as const;
const anil = { uid: "anil", name: "Anil", role: "tech_member", createdBy: "admin" } as const;

const GOOD_1 = "AIzaSyA0123456789abcdefghijklmnopqrstuv";
const GOOD_2 = "AIzaSyB_-ZYXWVUTSRQPONMLKJIHGFEDCBA9876";
const GOOD_3 = "AIzaSyC9999999999abcdefghijklmnopqrstuv";
const LEAKED = "AIzaSyDleakedleakedleakedleakedleaked00";
const INVALID = "AIzaSyEinvalidinvalidinvalidinvalidin00";

/** Fake Google: the models list answers each key the way the real one did on 2026-10-10. */
const google = { leaked: new Set([LEAKED]), invalid: new Set([INVALID]), calls: [] as string[] };
const fakeFetch = vi.fn(async (_url: string, init?: RequestInit) => {
  const key = (init?.headers as Record<string, string>)?.["x-goog-api-key"] || "";
  google.calls.push(key);
  if (google.invalid.has(key)) return new Response(JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }), { status: 400 });
  if (google.leaked.has(key)) return new Response(JSON.stringify({ error: { code: 403, message: "Your API key was reported as leaked. Please use another API key." } }), { status: 403 });
  return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200 });
});

const account = (id: string) => mem.__read(`flow_accounts/${id}`) as unknown as FlowAccount;
const keyDoc = (id: string) => mem.__read(`gemini_api_keys/${id}`) as unknown as GeminiApiKey | undefined;
const addFor = (who: typeof ravi | typeof anil | typeof admin, email: string, createdOn = "2026-10-01") =>
  svc.addFlowAccount({ email, password: `pw-${email}`, phone: "9876543210", createdOn }, who, S);
const working = { status: "working" as const };

/** The signed-in person, kept live from users/{uid} the way useAuth does. */
function signIn(user: AppUser) {
  mem.__seed(`users/${user.uid}`, user as unknown as Record<string, unknown>);
  return mem.onSnapshot(mem.doc({}, "users", user.uid), ((snap: { data: () => AppUser }) =>
    useAuthStore.setState({ user: { ...snap.data(), uid: user.uid }, loading: false })) as never);
}

let clipboard = "";
let downloaded: { name: string; text: Promise<string> } | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-10T11:00:00"));
  mem.__reset();
  sendNotification.mockClear();
  toast.mockClear();
  fakeFetch.mockClear();
  google.calls = [];
  vi.stubGlobal("fetch", fakeFetch);
  clipboard = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async (t: string) => { clipboard = t; }), readText: vi.fn(async () => clipboard) },
  });
  downloaded = null;
  let lastBlob: Blob | null = null;
  URL.createObjectURL = vi.fn((b: Blob) => { lastBlob = b; return "blob:keys"; }) as never;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    // jsdom's Blob has no .text(); FileReader reads it.
    const blob = lastBlob;
    if (blob) downloaded = { name: this.download, text: new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); }) };
  });
  for (const u of [admin, leader, ravi, anil]) mem.__seed(`users/${u.uid}`, { ...u, isActive: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); useAuthStore.setState({ user: null }); });

describe("Gemini API keys — the service", () => {
  it("saves a key apart from its account, with Google's answer, and says so in the history", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.saveFlowApiKey(account("a@gmail.com"), `  ${GOOD_1}\n`, working, ravi);
    expect(keyDoc("a@gmail.com")).toMatchObject({
      key: GOOD_1, fingerprint: apiKeyFingerprint(GOOD_1), accountEmail: "a@gmail.com", ownerId: "ravi", ownerName: "Ravi",
      addedById: "ravi", teamAdminId: "admin", status: "working", inUse: false,
    });
    const a = account("a@gmail.com");
    expect(a.apiKey).toMatchObject({ fingerprint: apiKeyFingerprint(GOOD_1), status: "working", addedByName: "Ravi" });
    expect(JSON.stringify(a)).not.toContain(GOOD_1);
    expect(a.history?.at(-1)).toMatchObject({ action: "api_key_added", byName: "Ravi" });
    expect(await svc.getAccountSecret("apiKey", "a@gmail.com")).toBe(GOOD_1);
  });

  it("starts a replacement key not in use; removing a key puts the account back to 'no key' and asks its owner for a new one", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.saveFlowApiKey(account("a@gmail.com"), GOOD_1, working, ravi);
    await svc.setApiKeysInUse([{ id: "a@gmail.com" }], true, admin);
    expect(keyDoc("a@gmail.com")).toMatchObject({ inUse: true, inUseByName: "Kiran (CTO)" });

    await svc.saveFlowApiKey(account("a@gmail.com"), GOOD_2, working, ravi);
    expect(keyDoc("a@gmail.com")).toMatchObject({ key: GOOD_2, inUse: false });
    expect(account("a@gmail.com").history?.at(-1)).toMatchObject({ action: "api_key_replaced" });

    await svc.removeFlowApiKey(keyDoc("a@gmail.com")!, admin, { uid: "ravi", name: "Ravi", role: "tech_member" });
    expect(keyDoc("a@gmail.com")).toBeUndefined();
    expect(account("a@gmail.com").apiKey).toBeUndefined();
    expect(account("a@gmail.com").history?.at(-1)).toMatchObject({ action: "api_key_removed", byName: "Kiran (CTO)" });
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "ravi", title: "Add a new Gemini API key", link: "/tech/ai-accounts" }));
  });

  it("saves each check on the key and its account, and tells an owner once when their key stops working", async () => {
    await addFor(ravi, "a@gmail.com");
    await addFor(anil, "b@gmail.com");
    await svc.saveFlowApiKey(account("a@gmail.com"), GOOD_1, working, ravi);
    await svc.saveFlowApiKey(account("b@gmail.com"), LEAKED, working, anil); // leaked after it was added
    const keys = [keyDoc("a@gmail.com")!, keyDoc("b@gmail.com")!];
    const results = await Promise.all(keys.map(async (key) => ({ key, check: await svc.checkGeminiApiKey(key.key) })));
    await svc.saveApiKeyChecks(results);
    expect(keyDoc("b@gmail.com")).toMatchObject({ status: "failed", statusMessage: expect.stringMatching(/leaked/) });
    expect(account("b@gmail.com").apiKey).toMatchObject({ status: "failed", message: expect.stringMatching(/leaked/), fingerprint: apiKeyFingerprint(LEAKED) });
    expect(account("a@gmail.com").apiKey).toMatchObject({ status: "working" });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: "anil", title: "Your Gemini API key stopped working", dedupeKey: `api_key_failed_b@gmail.com_${apiKeyFingerprint(LEAKED)}`,
    }));
    // Checked again: still failed, nobody is told twice.
    await svc.saveApiKeyChecks([{ key: keyDoc("b@gmail.com")!, check: { status: "failed", message: "x" } }]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("deletes the key with its Flow account", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.saveFlowApiKey(account("a@gmail.com"), GOOD_1, working, ravi);
    await svc.deleteFlowAccount(account("a@gmail.com"));
    expect(keyDoc("a@gmail.com")).toBeUndefined();
    expect(mem.__read("flow_account_secrets/a@gmail.com")).toBeUndefined();
  });

  it("asks Google's free models list with the key in a header, and never throws", async () => {
    expect(await svc.checkGeminiApiKey(GOOD_1)).toEqual({ status: "working" });
    expect(fakeFetch.mock.calls[0][0]).toMatch(/generativelanguage\.googleapis\.com\/v1beta\/models/);
    expect(fakeFetch.mock.calls[0][0]).not.toContain(GOOD_1);
    expect(await svc.checkGeminiApiKey(INVALID)).toMatchObject({ status: "failed", message: expect.stringMatching(/not valid/) });
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await svc.checkGeminiApiKey(GOOD_1, offline as never)).toMatchObject({ status: "unchecked" });
  });
});

describe("A member adds the key made in each account they opened", () => {
  it("walks through the accounts without a key: checks each with Google, refuses a typo and a key already used, then Save & next", async () => {
    await addFor(ravi, "a@gmail.com", "2026-10-01");
    await addFor(ravi, "b@gmail.com", "2026-10-02");
    const stop = signIn(ravi as unknown as AppUser);
    render(<MyAiAccounts />);

    const progress = await screen.findByTestId("api-key-progress");
    expect(within(progress).getByTestId("api-key-progress-count").textContent).toBe("0");
    expect(progress.textContent).toContain("/ 2 of your accounts have a key");
    expect(screen.getAllByTestId("flow-api-key-add")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("api-key-next"));
    const dialog = await screen.findByTestId("api-key-dialog");
    expect(dialog.textContent).toContain("a@gmail.com");
    // AI Studio opens in this account; every step is there the first time, with the name and project to copy.
    expect(within(dialog).getByTestId("api-key-open-studio").getAttribute("href")).toBe("https://aistudio.google.com/api-keys?authuser=a%40gmail.com");
    expect(within(dialog).getByTestId("api-key-steps").textContent).toMatch(/Create API key.*Gemini API Key.*Create project.*aiads.*Create key/s);

    const input = within(dialog).getByTestId("api-key-input");
    fireEvent.change(input, { target: { value: GOOD_1.slice(0, 25) } });
    expect(within(dialog).getByTestId("api-key-status").textContent).toMatch(/cut short/);
    fireEvent.change(input, { target: { value: INVALID } });
    await waitFor(() => expect(within(dialog).getByTestId("api-key-status").textContent).toMatch(/not valid/));
    fireEvent.click(within(dialog).getByTestId("api-key-save-next"));
    await waitFor(() => expect(google.calls.length).toBeGreaterThan(0));
    expect(keyDoc("a@gmail.com")).toBeUndefined();

    fireEvent.change(input, { target: { value: GOOD_1 } });
    await waitFor(() => expect(within(dialog).getByTestId("api-key-status").textContent).toMatch(/Google accepted/));
    expect(within(dialog).getByTestId("api-key-save-next").textContent).toContain("1 left");
    fireEvent.click(within(dialog).getByTestId("api-key-save-next"));

    // Straight on to the next account.
    await waitFor(() => expect(screen.getByTestId("api-key-dialog").textContent).toContain("b@gmail.com"));
    expect(keyDoc("a@gmail.com")).toMatchObject({ key: GOOD_1, status: "working" });
    const second = screen.getByTestId("api-key-dialog");
    expect(within(second).queryByTestId("api-key-save-next")).toBeNull();
    // Someone who has saved a key gets the steps folded, AI Studio still one tap away.
    expect(within(second).getByTestId("api-key-show-steps")).toBeInTheDocument();
    expect(within(second).getByTestId("api-key-open-studio").getAttribute("href")).toContain("authuser=b%40gmail.com");

    // The same key pasted again (the clipboard was not refreshed) is caught.
    clipboard = `  ${GOOD_1}  `;
    fireEvent.click(within(second).getByText("Paste"));
    await waitFor(() => expect(within(second).getByTestId("api-key-status").textContent).toMatch(/already saved on a@gmail.com/));
    fireEvent.change(within(second).getByTestId("api-key-input"), { target: { value: GOOD_2 } });
    await waitFor(() => expect(within(second).getByTestId("api-key-status").textContent).toMatch(/Google accepted/));
    fireEvent.click(within(second).getByTestId("api-key-save"));
    await waitFor(() => expect(screen.queryByTestId("api-key-dialog")).toBeNull());

    expect(keyDoc("b@gmail.com")).toMatchObject({ key: GOOD_2 });
    await waitFor(() => expect(screen.getByTestId("api-key-progress-count").textContent).toBe("2"));
    expect(screen.queryByTestId("api-key-next")).toBeNull();
    expect(screen.getAllByTestId("flow-api-key-status").map((e) => e.textContent)).toEqual(["Working", "Working"]);
    stop();
  });

  it("refuses a leaked key, and shows a key that stopped working with a way to replace it", async () => {
    await addFor(ravi, "a@gmail.com");
    await svc.saveFlowApiKey(account("a@gmail.com"), GOOD_1, working, ravi);
    await svc.saveApiKeyChecks([{ key: keyDoc("a@gmail.com")!, check: { status: "failed", message: "Google blocked this key — it was reported as leaked. Make a new one." } }]);
    const stop = signIn(ravi as unknown as AppUser);
    render(<MyAiAccounts />);

    expect((await screen.findByTestId("flow-api-key-failed")).textContent).toMatch(/reported as leaked/);
    expect(screen.getByTestId("api-key-progress-failed").textContent).toMatch(/1 key stopped working/);
    fireEvent.click(screen.getByTestId("api-key-next"));
    const dialog = await screen.findByTestId("api-key-dialog");
    expect(dialog.textContent).toMatch(/Replace the Gemini API key/);
    fireEvent.change(within(dialog).getByTestId("api-key-input"), { target: { value: LEAKED } });
    await waitFor(() => expect(within(dialog).getByTestId("api-key-status").textContent).toMatch(/reported as leaked/));
    fireEvent.click(within(dialog).getByTestId("api-key-save"));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(keyDoc("a@gmail.com")?.key).toBe(GOOD_1);

    fireEvent.change(within(dialog).getByTestId("api-key-input"), { target: { value: GOOD_3 } });
    await waitFor(() => expect(within(dialog).getByTestId("api-key-status").textContent).toMatch(/Google accepted/));
    fireEvent.click(within(dialog).getByTestId("api-key-save"));
    await waitFor(() => expect(keyDoc("a@gmail.com")).toMatchObject({ key: GOOD_3, status: "working" }));
    await waitFor(() => expect(screen.queryByTestId("flow-api-key-failed")).toBeNull());
    stop();
  });

  it("goes straight on to the key after adding a new Flow account", async () => {
    const stop = signIn(ravi as unknown as AppUser);
    render(<MyAiAccounts />);
    fireEvent.click(await screen.findByTestId("flow-add"));
    fireEvent.change(screen.getByTestId("flow-email"), { target: { value: "new.flow@gmail.com" } });
    fireEvent.change(screen.getByTestId("flow-password"), { target: { value: "secret" } });
    fireEvent.change(screen.getByTestId("flow-phone"), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByTestId("flow-account-save"));
    const dialog = await screen.findByTestId("api-key-dialog");
    expect(dialog.textContent).toContain("new.flow@gmail.com");
    stop();
  });
});

describe("The tech admin's API keys", () => {
  async function seedKeys() {
    await addFor(ravi, "r1@gmail.com");
    await addFor(ravi, "r2@gmail.com");
    await addFor(ravi, "r3@gmail.com"); // no key yet
    await addFor(anil, "a1@gmail.com");
    await svc.saveFlowApiKey(account("r1@gmail.com"), GOOD_1, working, ravi);
    await svc.saveFlowApiKey(account("r2@gmail.com"), LEAKED, { status: "failed", message: "Google blocked this key — it was reported as leaked. Make a new one." }, ravi);
    await svc.saveFlowApiKey(account("a1@gmail.com"), GOOD_2, working, anil);
  }

  it("lists only the keys, by person; copies a set and downloads it as a .env — leaving out the refused key", async () => {
    await seedKeys();
    const stop = signIn(admin as unknown as AppUser);
    render(<AiAccounts />);
    fireEvent.click(await screen.findByTestId("tab-keys"));
    const panel = await screen.findByTestId("api-keys-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row")).toHaveLength(3));
    expect(within(panel).getAllByTestId("keys-group").map((g) => g.textContent?.slice(0, 4))).toEqual(["Anil", "Ravi"]);
    expect(within(panel).getByTestId("keys-missing").textContent).toMatch(/Ravi 2/); // r3 has none, r2's was refused
    expect(within(panel).getAllByTestId("keys-row-key")[0].textContent).toBe("AIzaSyB…9876");
    expect(within(panel).getAllByTestId("keys-row-status").map((e) => e.textContent)).toEqual(["Working", "Working", "Not working"]);

    fireEvent.click(within(panel).getByTestId("keys-copy"));
    await waitFor(() => expect(clipboard).toBe(`${GOOD_2}\n${GOOD_1}`));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied 2 keys", description: expect.stringMatching(/1 key Google refused was left out/) }));

    fireEvent.click(within(panel).getByTestId("keys-env"));
    expect(downloaded?.name).toBe("dts-adgen-gemini-keys-2026-10-10.env");
    const env = await downloaded!.text;
    expect(env).toContain(`# 1 · Anil · a1@gmail.com\nAPI_KEY_1=${GOOD_2}`);
    expect(env).toContain(`# 2 · Ravi · r1@gmail.com\nAPI_KEY_2=${GOOD_1}`);
    expect(env).not.toContain(LEAKED);

    // Copy one person's keys only.
    fireEvent.change(within(panel).getByTestId("keys-person"), { target: { value: "ravi" } });
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row")).toHaveLength(2));
    fireEvent.click(within(panel).getByTestId("keys-copy"));
    await waitFor(() => expect(clipboard).toBe(GOOD_1));
    stop();
  });

  it("marks a chosen set in use (and one back), checks keys with Google and tells the owner of one that died", async () => {
    await seedKeys();
    const stop = signIn(admin as unknown as AppUser);
    render(<AiAccounts />);
    fireEvent.click(await screen.findByTestId("tab-keys"));
    const panel = await screen.findByTestId("api-keys-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row")).toHaveLength(3));

    const ticks = within(panel).getAllByTestId("keys-row-select");
    fireEvent.click(ticks[0]);
    fireEvent.click(ticks[1]);
    expect(within(panel).getByTestId("keys-copy").textContent).toContain("(2)");
    fireEvent.click(within(panel).getByTestId("keys-mark-in-use"));
    await waitFor(() => expect(keyDoc("a1@gmail.com")?.inUse).toBe(true));
    expect(keyDoc("r1@gmail.com")).toMatchObject({ inUse: true, inUseByName: "Kiran (CTO)" });
    expect(keyDoc("r2@gmail.com")?.inUse).toBe(false);
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row-in-use").map((b) => b.textContent?.trim())).toEqual(["In use", "In use", "Mark in use"]));

    // Only the in-use keys, as a .env.
    fireEvent.change(within(panel).getByTestId("keys-status"), { target: { value: "in_use" } });
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row")).toHaveLength(2));
    fireEvent.click(within(panel).getByTestId("keys-env"));
    expect((await downloaded!.text).match(/^API_KEY_\d+=/gm)).toHaveLength(2);

    fireEvent.click(within(panel).getAllByTestId("keys-row-in-use")[0]);
    await waitFor(() => expect(keyDoc("a1@gmail.com")?.inUse).toBe(false));
    fireEvent.change(within(panel).getByTestId("keys-status"), { target: { value: "all" } });

    // Anil's key gets reported as leaked; the check finds it, saves it and tells Anil.
    google.leaked.add(GOOD_2);
    fireEvent.click(within(panel).getByTestId("keys-check"));
    await waitFor(() => expect(keyDoc("a1@gmail.com")?.status).toBe("failed"));
    expect(account("a1@gmail.com").apiKey?.status).toBe("failed");
    await waitFor(() => expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "anil", title: "Your Gemini API key stopped working" })));
    expect(sendNotification).toHaveBeenCalledTimes(1); // Ravi's r2 was already known dead
    stop();
  });

  it("removes a key after asking, and the owner is asked for a new one", async () => {
    await seedKeys();
    const stop = signIn(admin as unknown as AppUser);
    render(<AiAccounts />);
    fireEvent.click(await screen.findByTestId("tab-keys"));
    const panel = await screen.findByTestId("api-keys-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("keys-row")).toHaveLength(3));
    fireEvent.click(within(panel).getAllByTestId("keys-row-remove")[2]);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(keyDoc("r2@gmail.com")).toBeUndefined());
    expect(account("r2@gmail.com").apiKey).toBeUndefined();
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "ravi", title: "Add a new Gemini API key" }));
    stop();
  });

  it("is the tech admin's alone — a team leader sees which accounts have a key, never the keys", async () => {
    await seedKeys();
    const stop = signIn(leader as unknown as AppUser);
    render(<AiAccounts />);
    await screen.findByTestId("tab-flow");
    expect(screen.queryByTestId("tab-keys")).toBeNull();
    // The overview counts working keys per member.
    await waitFor(() => expect(screen.getAllByTestId("member-keys").map((e) => e.textContent)).toEqual(["1/1", "1/3"]));
    fireEvent.click(screen.getByTestId("tab-flow"));
    const cards = await screen.findAllByTestId("flow-account-card");
    const r1 = cards.find((c) => c.textContent?.includes("r1@gmail.com"))!;
    expect(within(r1).getByTestId("flow-api-key-status").textContent).toBe("Working");
    expect(within(within(r1).getByTestId("flow-api-key")).queryByTestId("secret-toggle")).toBeNull();
    const r3 = cards.find((c) => c.textContent?.includes("r3@gmail.com"))!;
    expect(within(r3).queryByTestId("flow-api-key-add")).toBeNull();
    expect(within(r3).getByTestId("flow-api-key").textContent).toContain("Not added yet");
    stop();
  });
});
