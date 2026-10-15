/**
 * SMM Delivery Control, phase 5 — the AI parts on screen (jsdom) and the service under them (2026-10-15).
 *
 * Gemini is faked at the call layer (`callGeminiWithFallback` runs the service's own request against a fake
 * client, so the real prompts, checks and fallbacks run); `fetchClientMonths` is faked too. What is held:
 *   • the titles panel accepts ONLY the ticked rows; a piece somebody titled starts unticked (and a row is
 *     unticked the moment its piece gets a title); Preview can try the AI but never accept; a failed AI shows
 *     "Gemini is busy — titles left blank for you" with blank titles; a failed past-months read is said;
 *   • the briefs show the plain text at once, the AI's when it comes (numbers filled by code, a wrong number
 *     refused), the cache once per person, Refresh asks again;
 *   • the client update: plain draft at once, the AI's two lines around the code's lists, Telugu, a draft the
 *     person edited is never replaced, WhatsApp / Copy;
 *   • the reasons summary's client / team counts;
 *   • the service never throws: effort per call, garbage, partial answers, a time-out.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  responder: vi.fn<(call: { system: string; text: string; effort?: string }) => unknown>(),
  calls: [] as { system: string; text: string; effort?: string }[],
  fetchClientMonths: vi.fn(),
}));

vi.mock("@/services/geminiService", () => ({
  callGeminiWithFallback: async (fn: (ai: unknown, model: string) => Promise<unknown>, opts?: { effort?: string }) => fn({
    models: {
      generateContent: async (params: { contents: { parts: { text: string }[] }[]; config?: { systemInstruction?: string } }) => {
        const call = { system: params.config?.systemInstruction || "", text: params.contents[0].parts[0].text, effort: opts?.effort };
        h.calls.push(call);
        return { text: await h.responder(call) };
      },
    },
  }, "test-model"),
}));
vi.mock("@/services/smm", () => ({ fetchClientMonths: h.fetchClientMonths }));

import AiTitlesPanel from "@/components/smm/control/ai/AiTitlesPanel";
import BriefCard from "@/components/smm/control/ai/BriefCard";
import ClientUpdateDialog from "@/components/smm/control/ai/ClientUpdateDialog";
import ReasonsSummary from "@/components/smm/control/ai/ReasonsSummary";
import { clientWeeklyUpdate, memberWeekBrief, morningBrief, resetSmmAiMemo, suggestWeekTasks } from "@/services/smmAi";
import { planMonth } from "@/utils/smmCadence";
import { weekBriefCacheKey } from "@/utils/smmAiRules";
import { month, piece } from "./smmDeliveryFixtures";

configure({ testIdAttribute: "data-test" });
const TODAY = "2026-10-15";

beforeEach(() => {
  h.calls.length = 0;
  h.responder.mockReset();
  h.fetchClientMonths.mockReset();
  h.fetchClientMonths.mockResolvedValue([
    { id: "m0", cycle: { startDate: "2026-09-15", endDate: "2026-10-15" }, status: "renewed", items: [{ title: "Monsoon gold" }] },
  ]);
  try { localStorage.clear(); } catch { /* jsdom */ }
  resetSmmAiMemo();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Lakshmi's month: 4 videos + 4 posters; v1 already has a title somebody typed. */
const lakshmi = (over: Record<string, unknown> = {}) => month({
  commitments: { ai_ad: 4, poster: 4, real_video: 0 },
  items: [
    piece({ id: "v1", title: "Founder story" }), piece({ id: "v2" }), piece({ id: "v3" }), piece({ id: "v4" }),
    piece({ id: "s1", kind: "poster" }), piece({ id: "s2", kind: "poster" }), piece({ id: "s3", kind: "poster" }), piece({ id: "s4", kind: "poster" }),
  ],
  ...over,
});
const planOf = (m: ReturnType<typeof month>) => planMonth(m, { today: TODAY, holidays: null });

/** A titles answer for every itemId the prompt asked about; Dasara on s1. */
const titlesReply = (call: { text: string }) => JSON.stringify({
  tasks: [...call.text.matchAll(/- itemId: (\S+)/g)].map(([, id]) => ({
    itemId: id, title: `Fresh idea ${id}`, idea: `What ${id} shows.`, caption: `Caption for ${id}.`, hashtags: ["#Gold", "#Lakshmi"],
    festival: id === "s1" ? { name: "Dasara", date: "2026-10-20" } : null,
  })),
});

const rowOf = (id: string) => screen.getAllByTestId("smm-ai-row").find((r) => r.getAttribute("data-item") === id)!;
const tickOf = (id: string) => within(rowOf(id)).getByTestId("smm-ai-tick");

describe("the titles panel", () => {
  it("suggests, keeps a titled piece unticked, and accepts only the ticked rows", async () => {
    h.responder.mockImplementation(titlesReply);
    const onAccept = vi.fn(async (_entries: unknown[]) => undefined);
    const m = lakshmi();
    render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept preview={false} onAccept={onAccept} />);
    expect(screen.getByTestId("smm-ai-titles-count").textContent).toBe("8 pieces not live yet · 7 without a title");

    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    await screen.findByTestId("smm-ai-ready");
    expect(h.fetchClientMonths).toHaveBeenCalledWith("9");
    expect(h.calls[0].effort).toBe("standard");
    expect(h.calls[0].text).toContain("- Monsoon gold");

    expect(tickOf("v1").getAttribute("data-state")).toBe("unchecked");
    expect(within(rowOf("v1")).getByText(/not changed unless you tick it/)).toBeTruthy();
    expect(tickOf("v2").getAttribute("data-state")).toBe("checked");
    expect((within(rowOf("s1")).getByTestId("smm-ai-festival") as HTMLSelectElement).value).toBe("2026-10-20");

    fireEvent.click(tickOf("s2"));
    expect(tickOf("s2").getAttribute("data-state")).toBe("unchecked");
    fireEvent.change(within(rowOf("v2")).getByTestId("smm-ai-title-input"), { target: { value: "Bridal week" } });
    expect(screen.getByTestId("smm-ai-accept").textContent).toBe("Accept ticked (6)");
    fireEvent.click(screen.getByTestId("smm-ai-accept"));
    await screen.findByTestId("smm-ai-save-msg");

    expect(onAccept).toHaveBeenCalledTimes(1);
    const entries = onAccept.mock.calls[0][0] as { itemId: string; title: string; festival: unknown; hashtags: string[] }[];
    expect(entries.map((e) => e.itemId).sort()).toEqual(["s1", "s3", "s4", "v2", "v3", "v4"]);
    expect(entries.find((e) => e.itemId === "v2")?.title).toBe("Bridal week");
    expect(entries.find((e) => e.itemId === "s1")?.festival).toEqual({ name: "Dussehra / Vijayadashami (Dasara)", date: "2026-10-20" });
    expect(entries[0].hashtags).toEqual(["#Gold", "#Lakshmi"]);
    expect(screen.getByTestId("smm-ai-save-msg").textContent).toMatch(/Saved 6 pieces/);
    expect(screen.getAllByTestId("smm-ai-row-saved")).toHaveLength(6);
  });

  it("unticks a row the moment somebody gives its piece a title", async () => {
    h.responder.mockImplementation(titlesReply);
    const m = lakshmi();
    const { rerender } = render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept preview={false} onAccept={vi.fn()} />);
    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    await screen.findByTestId("smm-ai-ready");
    expect(tickOf("v3").getAttribute("data-state")).toBe("checked");
    const typed = { ...m, items: m.items.map((i) => (i.id === "v3" ? { ...i, title: "Typed by Ravi" } : i)) };
    rerender(<AiTitlesPanel month={typed} plan={planOf(typed)} today={TODAY} canAccept preview={false} onAccept={vi.fn()} />);
    expect(tickOf("v3").getAttribute("data-state")).toBe("unchecked");
  });

  it("in Preview, tries the AI but cannot accept — 'would set — not saved'", async () => {
    h.responder.mockImplementation(titlesReply);
    const onAccept = vi.fn(async (_entries: unknown[]) => undefined);
    const m = lakshmi();
    render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept preview onAccept={onAccept} />);
    expect(screen.getByTestId("smm-ai-preview").textContent).toMatch(/not saved/);
    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    await screen.findByTestId("smm-ai-ready");
    const accept = screen.getByTestId("smm-ai-accept") as HTMLButtonElement;
    expect(accept.textContent).toBe("Would set 7 — not saved");
    expect(accept.disabled).toBe(true);
    fireEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("without the right to accept, the button is off and says why", async () => {
    h.responder.mockImplementation(titlesReply);
    const m = lakshmi();
    render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept={false} preview={false} onAccept={vi.fn()} />);
    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    await screen.findByTestId("smm-ai-ready");
    expect((screen.getByTestId("smm-ai-accept") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("smm-ai-cannot-accept")).toBeTruthy();
  });

  it("when Gemini fails: the plain line, blank titles, the week's festival still suggested, nothing ticked", async () => {
    h.responder.mockRejectedValue(new Error("Gemini's free daily limit is used up on all 19 working API keys."));
    const m = lakshmi();
    render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept preview={false} onAccept={vi.fn()} />);
    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    const failed = await screen.findByTestId("smm-ai-failed");
    expect(failed.textContent).toMatch(/Gemini is busy — titles left blank for you\./);
    expect(screen.getByTestId("smm-ai-problem").textContent).toMatch(/daily limit/);
    expect(screen.getAllByTestId("smm-ai-title-input").every((i) => (i as HTMLInputElement).value === "")).toBe(true);
    expect((within(rowOf("s1")).getByTestId("smm-ai-festival") as HTMLSelectElement).value).toBe("2026-10-20");
    expect(screen.getByTestId("smm-ai-accept").textContent).toBe("Accept ticked (0)");
  });

  it("says when the last months' titles could not be read, and still suggests", async () => {
    h.fetchClientMonths.mockRejectedValue(new Error("permission-denied"));
    h.responder.mockImplementation(titlesReply);
    const m = lakshmi();
    render(<AiTitlesPanel month={m} plan={planOf(m)} today={TODAY} canAccept preview={false} onAccept={vi.fn()} />);
    fireEvent.click(screen.getByTestId("smm-ai-suggest"));
    await screen.findByTestId("smm-ai-ready");
    expect(screen.getByTestId("smm-ai-past-note").textContent).toMatch(/repeats were not checked/);
  });
});

const weekInput = {
  uid: "ravi", name: "Ravi", today: TODAY,
  tasks: [
    { clientName: "Ravi Motors", type: "ai_video", title: "", deadlineDay: "2026-10-17", state: "late", nextStep: "make", nextDay: "2026-10-16" },
    { clientName: "Lakshmi Jewellers", type: "poster", title: "", deadlineDay: "2026-10-21", state: "on_track" },
    { clientName: "Sai Silks", type: "poster", title: "", deadlineDay: "2026-10-21", state: "on_track" },
  ],
};

describe("the brief card", () => {
  it("shows the plain week at once, then the AI's with the code's numbers, cached for the week", async () => {
    let release: (v: string) => void = () => undefined;
    h.responder.mockImplementation(() => new Promise<string>((r) => { release = r; }));
    render(<BriefCard kind="week" input={weekInput} />);
    expect(screen.getByTestId("smm-brief-text").textContent).toBe("3 tasks across 3 clients this week. Do Ravi Motors' video first — send it to the client by Fri 16 Oct. 1 is already late.");
    expect(screen.getByTestId("smm-plain-tag")).toBeTruthy();
    await waitFor(() => expect(h.calls).toHaveLength(1));
    await act(async () => { release(JSON.stringify({ text: "{tasks} tasks across {clients} clients — start with Ravi Motors' video, it is late." })); });
    await waitFor(() => expect(screen.getByTestId("smm-brief-text").textContent).toBe("3 tasks across 3 clients — start with Ravi Motors' video, it is late."));
    expect(screen.getByTestId("smm-ai-tag")).toBeTruthy();
    expect(h.calls[0].effort).toBe("fast");
    expect(localStorage.getItem(weekBriefCacheKey("ravi", TODAY))).toMatch(/start with Ravi Motors/);

    cleanup();
    render(<BriefCard kind="week" input={{ ...weekInput, today: "2026-10-17" }} />);
    expect(screen.getByTestId("smm-brief-text").textContent).toMatch(/start with Ravi Motors' video/);
    expect(h.calls).toHaveLength(1);

    h.responder.mockResolvedValue(JSON.stringify({ text: "{tasks} tasks this week — Ravi Motors first." }));
    fireEvent.click(screen.getByTestId("smm-brief-refresh"));
    await waitFor(() => expect(screen.getByTestId("smm-brief-text").textContent).toBe("3 tasks this week — Ravi Motors first."));
    expect(h.calls).toHaveLength(2);
  });

  it("refuses an AI brief whose number disagrees, and keeps the plain one", async () => {
    h.responder.mockResolvedValue(JSON.stringify({ text: "{tasks} tasks — 2 are late, start with Ravi Motors." }));
    render(<BriefCard kind="week" input={weekInput} />);
    await waitFor(() => expect(screen.queryByTestId("smm-brief-loading")).toBeNull());
    expect(screen.getByTestId("smm-plain-tag")).toBeTruthy();
    expect(screen.getByTestId("smm-brief-text").textContent).toMatch(/^3 tasks across 3 clients this week/);
    expect(screen.getByTestId("smm-brief-problem").textContent).toMatch(/could not be used/);
  });

  it("the morning brief stays plain when Gemini is down", async () => {
    h.responder.mockRejectedValue(new Error("Google's Gemini servers are overloaded right now."));
    render(<BriefCard kind="morning" input={{ uid: "priya", name: "Priya", role: "tech_member", today: TODAY, numbers: { late: 1, dueToday: 2 } }} />);
    await screen.findByTestId("smm-brief-problem");
    expect(screen.getByTestId("smm-brief-text").textContent).toBe("Good morning, Priya. Today: 1 late, 2 due today.");
    expect(screen.getByTestId("smm-brief-problem").textContent).toMatch(/overloaded/);
  });
});

const updateInput = {
  clientName: "Lakshmi", week: 2,
  live: [{ title: "Dasara wishes", type: "ai_video", links: ["https://instagram.com/p/abc"] }],
  coming: [{ title: "Bridal sets", type: "poster", day: "2026-10-27" }],
  waitingOnClient: [{ title: "Showroom tour", type: "real_video", since: "2026-10-20" }],
};

describe("the client update dialog", () => {
  it("drafts in English around the code's lists, then Telugu; WhatsApp and Copy", async () => {
    h.responder.mockImplementation((call) => (/LANGUAGE: Telugu/.test(call.text)
      ? JSON.stringify({ opening: "నమస్కారం Lakshmi గారు, ఈ వారం అప్‌డేట్ ఇదిగో.", closing: "మీ రిప్లై కోసం ఎదురుచూస్తున్నాం. ధన్యవాదాలు!" })
      : JSON.stringify({ opening: "Hello Lakshmi garu, here is your week 2 update.", closing: "Please reply when you can. Thank you!" })));
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ClientUpdateDialog open onOpenChange={vi.fn()} input={updateInput} phone="98480 12345" />);
    const box = screen.getByTestId("smm-client-update-text") as HTMLTextAreaElement;
    expect(box.value).toMatch(/^Hello Lakshmi garu 🙏/);
    await waitFor(() => expect(box.value).toMatch(/^Hello Lakshmi garu, here is your week 2 update\./));
    expect(box.value).toContain("https://instagram.com/p/abc");
    expect(box.value).toContain("• Bridal sets (poster) — Tue 27 Oct");
    const wa = screen.getByTestId("smm-client-update-whatsapp") as HTMLAnchorElement;
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/919848012345\?text=Hello%20Lakshmi%20garu/);

    fireEvent.click(screen.getByTestId("smm-client-update-copy"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(box.value));

    fireEvent.click(screen.getByTestId("smm-client-update-lang-te"));
    await waitFor(() => expect((screen.getByTestId("smm-client-update-text") as HTMLTextAreaElement).value).toMatch(/^నమస్కారం Lakshmi గారు, ఈ వారం/));
    expect((screen.getByTestId("smm-client-update-text") as HTMLTextAreaElement).value).toContain("27 Oct (మంగళ)");
  });

  it("never replaces a draft the person started editing, and has no WhatsApp without a number", async () => {
    let release: (v: string) => void = () => undefined;
    h.responder.mockImplementation(() => new Promise<string>((r) => { release = r; }));
    render(<ClientUpdateDialog open onOpenChange={vi.fn()} input={updateInput} phone={null} />);
    const box = screen.getByTestId("smm-client-update-text") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "My own words" } });
    await waitFor(() => expect(h.calls).toHaveLength(1));
    await act(async () => { release(JSON.stringify({ opening: "Hello Lakshmi garu.", closing: "Thank you!" })); });
    expect(box.value).toBe("My own words");
    const wa = screen.getByTestId("smm-client-update-whatsapp") as HTMLButtonElement;
    expect(wa.disabled).toBe(true);
    expect(wa.textContent).toMatch(/No client number/);
  });
});

describe("the reasons summary", () => {
  it("shows the client / team counts and the AI's sentences with the code's numbers", async () => {
    h.responder.mockResolvedValue(JSON.stringify({ text: "{client} of {total} delays waited on clients and {team} was the team's — chase approvals earlier." }));
    render(<ReasonsSummary label="This week" reasons={[
      { clientName: "Lakshmi", type: "ai_video", step: "approved", reason: "Client not answering", byName: "Sita" },
      { clientName: "Ravi Motors", type: "real_video", step: "footage", reason: "No footage", byName: "Sita" },
      { clientName: "Sai Silks", type: "poster", step: "approved", reason: "Client travelling", byName: "Sita" },
      { clientName: "Lakshmi", type: "poster", step: "send", reason: "Flow credits", byName: "Ravi" },
    ]} />);
    expect(screen.getByTestId("smm-reasons-counts").textContent).toMatch(/Client delays: 3.*Team delays: 1/);
    await waitFor(() => expect(screen.getByTestId("smm-reasons-text").textContent).toBe("3 of 4 delays waited on clients and 1 was the team's — chase approvals earlier."));
    expect(screen.getByTestId("smm-ai-tag")).toBeTruthy();
  });

  it("asks nothing when there are no reasons", () => {
    render(<ReasonsSummary label="October" reasons={[]} />);
    expect(screen.getByTestId("smm-reasons-text").textContent).toBe("October: no late reasons recorded.");
    expect(h.calls).toHaveLength(0);
  });
});

describe("the service never throws", () => {
  const m = lakshmi();
  const input = { month: m, plan: planOf(m), pastTitles: [], today: TODAY };

  it("garbage → blank titles with the week's festival, and the reason", async () => {
    h.responder.mockResolvedValue("I cannot help with that.");
    const r = await suggestWeekTasks(input);
    expect([r.usedAi, r.problem]).toEqual([false, "Gemini's answer could not be used."]);
    expect(r.suggestions).toHaveLength(8);
    expect(r.suggestions.every((s) => !s.title)).toBe(true);
    expect(r.suggestions.find((s) => s.itemId === "s1")?.festival?.date).toBe("2026-10-20");
  });

  it("a partial answer is used and the rest left blank, said in a sentence", async () => {
    h.responder.mockResolvedValue(JSON.stringify({ tasks: [{ itemId: "v2", title: "Bridal week" }, { itemId: "s3", title: "Temple gold" }] }));
    const r = await suggestWeekTasks(input);
    expect(r.usedAi).toBe(true);
    expect(r.problem).toBe("Gemini wrote 2 of 8 — the rest are left blank for you.");
    expect(r.suggestions.filter((s) => s.title).map((s) => s.itemId)).toEqual(["v2", "s3"]);
  });

  it("a broken month or no keys still answers", async () => {
    expect(await suggestWeekTasks({ ...input, plan: null as never })).toEqual({ suggestions: [], usedAi: false, problem: "This month's plan could not be read." });
    h.responder.mockRejectedValue(new Error("No API keys configured. Please set API_KEY_1, API_KEY_2, etc. in your environment."));
    const r = await clientWeeklyUpdate(updateInput);
    expect(r.usedAi).toBe(false);
    expect(r.problem).toBe("Gemini is not set up on this site (no API keys).");
    expect(r.text).toMatch(/^Hello Lakshmi garu 🙏/);
  });

  it("gives up after its time limit and returns the plain brief", async () => {
    vi.useFakeTimers();
    h.responder.mockImplementation(() => new Promise(() => undefined));
    const p = morningBrief({ uid: "u", name: "Priya", role: "tech_member", today: TODAY, numbers: { late: 1 } });
    await vi.advanceTimersByTimeAsync(41_000);
    const r = await p;
    expect(r).toEqual({ text: "Good morning, Priya. Today: 1 late.", usedAi: false, problem: "Gemini took too long to answer." });
  });

  it("does not ask again for ten minutes after a failure, unless refreshed", async () => {
    h.responder.mockRejectedValue(new Error("busy"));
    await memberWeekBrief(weekInput);
    await memberWeekBrief(weekInput);
    expect(h.calls).toHaveLength(1);
    await memberWeekBrief(weekInput, { fresh: true });
    expect(h.calls).toHaveLength(2);
  });
});
