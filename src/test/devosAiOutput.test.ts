import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async () => await import("./memoryFirestore"));

import * as sdk from "firebase/firestore";
import * as mem from "./memoryFirestore";
import { cleanScenario, parseDrafts } from "@/devos/engine/prompts";
import { draftProblems } from "@/devos/engine/aipool";
import { geminiPort, keyFingerprint } from "@/devos/engine/geminiPort";
import { clientStore, type ClientSdk } from "@/devos/engine/store";
import { deriveSecrets } from "@/devos/core/crypto";
import { PATH, type Deps } from "@/devos/engine/context";
import { DEAD_KEY_SKIP_MS, deadKeyFingerprints, recordDeadKeys } from "@/devos/engine/tick";
import type { HealthDoc } from "@/devos/core/types";

/**
 * What real Gemini wrote on 2026-10-18 and what the code now does with it: the item writer's design notes and a
 * repeated question are taken out of the scenario; keys Google refused are skipped by the next requests.
 */

describe("the scenario, without the writer's notes", () => {
  it("drops 'The trap here is …' (seen live) and keeps the situation word for word", () => {
    const live = "You're speaking with Mr. Rajesh Kumar, owner of 'Aroma Bakery' in Kakinada. He said: 'My nephew posts for free. Why should I pay your agency?' You know your basic plan includes 15 posts a month. The trap here is just listing features.";
    expect(cleanScenario(live)).toBe("You're speaking with Mr. Rajesh Kumar, owner of 'Aroma Bakery' in Kakinada. He said: 'My nephew posts for free. Why should I pay your agency?' You know your basic plan includes 15 posts a month.");
  });

  it("drops a closing question (it is asked once, in the question) but never a quoted one", () => {
    const live = "The client's feedback was, 'The voice sounds like a robot.' Your process has five steps. What is the MOST likely point of failure in this process?";
    expect(cleanScenario(live)).toBe("The client's feedback was, 'The voice sounds like a robot.' Your process has five steps.");
    const quoted = "Dr. Keerthi calls and asks: \"How does your monthly plan work?\"";
    expect(cleanScenario(quoted)).toBe(quoted);
  });

  it("keeps a one-sentence scenario even when it is a question, and titles are not sentence ends", () => {
    expect(cleanScenario("Which of these posts should go first?")).toBe("Which of these posts should go first?");
    expect(cleanScenario("Dr. Priya Sharma runs HealWell Clinic. The catch is that she trusts word of mouth.")).toBe("Dr. Priya Sharma runs HealWell Clinic.");
  });

  it("is applied when drafts are parsed, and a question that names the trap is refused", () => {
    const { drafts } = parseDrafts({ items: [{
      scenario: "Sunrise Bakery wants a festival poster by Friday and has sent three photos. The trap here is the deadline.",
      question: "What do you do first? The correct answer is to confirm the size.", options: ["Confirm the size", "Start designing", "Ask for more photos", "Call the printer"], correct: 0,
      explanation: "Confirming the size first avoids redoing the whole design later.", hints: ["Think about rework."], solution_logic: "Settle the size before the design.", objective: "plan", difficulty: 2,
    }] }, "mcq");
    expect(drafts[0].scenario).toBe("Sunrise Bakery wants a festival poster by Friday and has sent three photos.");
    expect(draftProblems(drafts[0], { difficulty: 2, codingAllowed: false })).toContain("says what the item tests");
  });
});

describe("keys Google refused are skipped by the next requests", () => {
  // Made-up stand-ins, longer than 20 like the port requires but not shaped like a real key (no scanner flags them).
  const good = "test-key-good-0000000000000";
  const dead = "test-key-dead-1111111111111";

  it("never sends a request with a skipped key", async () => {
    const used: string[] = [];
    const fetch = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      used.push(init.headers["x-goog-api-key"]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"reply\":\"ok\"}" }] } }] }), { status: 200 });
    });
    const port = geminiPort({ keys: [dead, good], fetch: fetch as unknown as typeof globalThis.fetch, skip: [keyFingerprint(dead)], maxCalls: 6 });
    for (let i = 0; i < 4; i++) await port.coach({ scenario: "s", question: "q", answerText: "a", correctText: "c", explanation: "e", ask: "why?" });
    expect(used.length).toBe(4);
    expect(used.every((k) => k === good)).toBe(true);
  });

  it("keeps every key when the list would skip them all (a stale list never switches the AI off)", async () => {
    const used: string[] = [];
    const fetch = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      used.push(init.headers["x-goog-api-key"]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"reply\":\"ok\"}" }] } }] }), { status: 200 });
    });
    const port = geminiPort({ keys: [good], fetch: fetch as unknown as typeof globalThis.fetch, skip: [keyFingerprint(good)] });
    const r = await port.coach({ scenario: "s", question: "q", answerText: "a", correctText: "c", explanation: "e", ask: "why?" });
    expect(r.value).toBe("ok");
    expect(used).toEqual([good]);
  });

  describe("the list is kept on the health document, for a day", () => {
    let clock = Date.UTC(2026, 9, 20, 5, 0);
    beforeEach(() => { mem.__reset(); clock = Date.UTC(2026, 9, 20, 5, 0); });
    const deps = async (): Promise<Deps> => ({
      store: clientStore(sdk as unknown as ClientSdk, {}), ai: null, secrets: await deriveSecrets("unit-test-secret-material-0123456789"),
      now: () => clock, notify: { send: async () => true }, log: () => undefined,
    });

    it("records fingerprints (never keys), merges repeats and expires them after a day", async () => {
      const d = await deps();
      await recordDeadKeys(d, [{ fp: "k1", why: "API key not valid" }, { fp: "k2", why: "reported as leaked" }]);
      await recordDeadKeys(d, [{ fp: "k1", why: "API key not valid" }]);
      const h = mem.__read(PATH.health) as unknown as HealthDoc;
      expect(h.deadKeys!.map((k) => k.fp).sort()).toEqual(["k1", "k2"]);
      expect(JSON.stringify(h)).not.toContain("AIza");
      expect(deadKeyFingerprints(h, clock).sort()).toEqual(["k1", "k2"]);
      expect(deadKeyFingerprints(h, clock + DEAD_KEY_SKIP_MS + 1)).toEqual([]);
    });
  });
});
