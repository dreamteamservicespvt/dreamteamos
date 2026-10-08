import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { adFormatPreset, effectiveAdFormatPreset, resolveAdFormatId, withCastDefaults, type AdFormatSelection } from "@/types/cinematicAds";

/**
 * 2026-10-08 — Cinematic Ads keeps the cast it was set up with (the same class of fault as the AI Ads duo:
 * a two-person configuration silently becoming one voice).
 *
 *   • "Let AI decide": the AI's answer is read by id OR label. A label or a hyphenated id used to fall back
 *     to "Let AI decide" itself — narration — so an ad the AI chose as a two-person conversation was made as
 *     a voice-over.
 *   • The AI's choice carries its cast details (who is talking), shown in the picker to change, instead of
 *     the story, casting and clips each guessing them.
 *   • A project is saved whole, so a cleared pairing never comes back from an old save.
 */

const setDoc = vi.fn(async () => undefined);
vi.mock("firebase/firestore", () => ({
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
}));
vi.mock("@/services/firebase", () => ({ db: {} }));

beforeEach(() => setDoc.mockClear());

describe("the AI's choice of format", () => {
  it("is read by its id or its label, whatever the case, spaces or hyphens", () => {
    for (const answer of ["two_person_conversation", "two-person-conversation", "Two-person conversation", " TWO PERSON CONVERSATION "]) {
      expect(resolveAdFormatId(answer), answer).toBe("two_person_conversation");
    }
    expect(resolveAdFormatId("One person to camera")).toBe("one_person_to_camera");
  });

  it("is no choice at all when it names no format — never 'Let AI decide' standing in for one", () => {
    for (const answer of ["ai_decides", "Let AI decide", "a funny conversation", "", undefined, 42]) {
      expect(resolveAdFormatId(answer), String(answer)).toBeUndefined();
    }
  });

  it("carries the cast details its format needs, exactly as picking it by hand does", () => {
    const chosen = withCastDefaults({ formatId: "ai_decides", aiChosenFormatId: "two_person_conversation" }, adFormatPreset("two_person_conversation"));
    expect(chosen).toMatchObject({ formatId: "ai_decides", aiChosenFormatId: "two_person_conversation", pairing: "male_female" });
    expect(effectiveAdFormatPreset(chosen).voForm).toBe("dialogue");
    // A detail the format does not use is dropped, so a stale pairing cannot leak into the prompts.
    expect(withCastDefaults({ formatId: "one_person_to_camera", pairing: "female_female" }, adFormatPreset("one_person_to_camera")))
      .toEqual({ formatId: "one_person_to_camera", pairing: undefined, speakerRole: "owner", speakerGender: "male", characterCount: undefined });
    // What the operator already chose is kept.
    expect(withCastDefaults({ formatId: "two_person_conversation", pairing: "female_female" }, adFormatPreset("two_person_conversation")).pairing).toBe("female_female");
  });

  it("shows who is talking in the picker once the AI has chosen a conversation", async () => {
    const { default: AdFormatPicker } = await import("@/components/cinematic-ads/AdFormatPicker");
    const value: AdFormatSelection = { formatId: "ai_decides", aiChosenFormatId: "two_person_conversation", pairing: "male_female" };
    render(<AdFormatPicker value={value} onChange={() => {}} />);
    expect(screen.getByText("Who is talking?")).toBeTruthy();
    expect(screen.getByText("Two-person conversation — cast details")).toBeTruthy();
    expect(screen.getByText("Male and female").className).toContain("border-primary");
  });
});

describe("saving a project", () => {
  it("writes the whole project, so a cleared pairing cannot come back from the stored one", async () => {
    const { saveProject } = await import("@/services/cinematicProjects");
    await saveProject({ id: "p1", createdBy: "u1", adFormat: { formatId: "one_person_to_camera", speakerRole: "owner" }, uploadedFiles: [] } as never);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const args = setDoc.mock.calls[0] as unknown[];
    expect(args).toHaveLength(2);
    expect((args[1] as { adFormat: Record<string, unknown> }).adFormat).toEqual({ formatId: "one_person_to_camera", speakerRole: "owner" });
  });
});
