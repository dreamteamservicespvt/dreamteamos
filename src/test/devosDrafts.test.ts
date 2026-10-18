/**
 * Unsent Development OS answers kept in the browser (2026-10-18): keyed by the person, and the Dev OS removes everyone
 * else's on opening — on a shared browser the next person on the same track saw someone's unsent weekly-challenge
 * evidence (every challenge that week has the same task id).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { purgeOtherDrafts, readItemDraft, readPracticalDraft, writeItemDraft, writePracticalDraft } from "@/components/devos/drafts";

beforeEach(() => localStorage.clear());

describe("devos drafts", () => {
  it("keeps each person's drafts apart, for the same question and the same weekly challenge", () => {
    writeItemDraft("u_a", "q1", "my unsent answer");
    writePracticalDraft("u_a", "challenge_2026-10-19", { notes: "A's evidence" });
    expect(readItemDraft("u_b", "q1")).toBe("");
    expect(readPracticalDraft("u_b", "challenge_2026-10-19")).toEqual({});
    expect(readItemDraft("u_a", "q1")).toBe("my unsent answer");
    expect(readPracticalDraft<{ notes: string }>("u_a", "challenge_2026-10-19")).toEqual({ notes: "A's evidence" });
  });

  it("an empty draft is removed, not stored", () => {
    writeItemDraft("u_a", "q1", "x");
    writeItemDraft("u_a", "q1", "");
    writePracticalDraft("u_a", "t1", { a: 1 });
    writePracticalDraft("u_a", "t1", null);
    expect(localStorage.length).toBe(0);
  });

  it("opening the Dev OS removes every draft that is not the viewer's — someone else's and the old keys without a person", () => {
    writeItemDraft("u_a", "q1", "A");
    writeItemDraft("u_b", "q2", "B");
    writePracticalDraft("u_b", "challenge_2026-10-19", { notes: "B" });
    localStorage.setItem("devos_draft_q9", "old, no person");
    localStorage.setItem("devos_practical_challenge_2026-10-12", "{}");
    localStorage.setItem("theme", "dark"); // not a Dev OS key: untouched
    purgeOtherDrafts("u_a");
    expect(Object.keys(localStorage).sort()).toEqual(["devos_draft_u_a_q1", "theme"]);
  });
});
