import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import {
  CLIP_PRESETS, CLIP_SECONDS, DURATIONS, clipChoiceLabel, durationChoiceLabel, getClipCount,
  humanDuration, secondsForClips,
} from "@/utils/assignmentDuration";
import { HEADER_BAND_PERCENT, HEADER_SYSTEM_PROMPT } from "@/services/prompts";
import { WISHES_FESTIVALS, WISHES_OCCASION_GROUPS, isListedFestival } from "@/utils/festivals";
import DurationPicker from "@/components/work/DurationPicker";
import OccasionPicker from "@/components/work/OccasionPicker";

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

/**
 * One unit, spoken the same way everywhere.
 *
 * Sales picked a length in minutes and seconds; production counts in 8-second clips. The
 * conversion happened silently after the sale, so "1 minute" sold became 8 clips built (64s) and
 * "45 seconds" sold became 6 clips (48s) — and nobody found out until the ad was the wrong length.
 */
describe("saying a length", () => {
  it("reads in seconds under a minute and in minutes above it", () => {
    expect(humanDuration(32)).toBe("32 sec");
    expect(humanDuration(48)).toBe("48 sec");
    expect(humanDuration(64)).toBe("1 min 4 sec");
    expect(humanDuration(120)).toBe("2 min");
  });

  it("puts the clip count first, with the seconds beside it", () => {
    expect(clipChoiceLabel(4)).toBe("4 clips · 32 sec");
    expect(clipChoiceLabel(8)).toBe("8 clips · 1 min 4 sec");
    expect(clipChoiceLabel(15)).toBe("15 clips · 2 min");
  });

  it("says 'clip' when there is only one of them", () => {
    expect(clipChoiceLabel(1)).toBe("1 clip · 8 sec");
  });

  it("agrees with the stored duration string", () => {
    expect(durationChoiceLabel("32s")).toBe("4 clips · 32 sec");
    expect(durationChoiceLabel("120s")).toBe("15 clips · 2 min");
  });

  it("round-trips clips → seconds → clips", () => {
    for (const n of CLIP_PRESETS) {
      expect(secondsForClips(n)).toBe(n * CLIP_SECONDS);
      expect(getClipCount(`${secondsForClips(n)}s`)).toBe(n);
    }
  });
});

/**
 * The three edit dialogs could only offer the category's packages, which stop at 8 clips — so an
 * already-assigned two-minute ad could never be corrected to its real length.
 */
describe("editing the length of assigned work", () => {
  /**
   * Rendered against real state, because the picker is controlled: it derives "am I on a custom
   * length?" from the value it is handed, so a harness that never updates the value could not
   * reach the custom box at all — which is precisely the state the edit dialogs live in.
   */
  const renderPicker = (initial: string) => {
    const seen: { duration: string; clips: number }[] = [];
    const Harness = () => {
      const [duration, setDuration] = useState(initial);
      return (
        <DurationPicker
          category="promotional"
          duration={duration}
          onChange={(d, c) => { seen.push({ duration: d, clips: c }); setDuration(d); }}
        />
      );
    };
    render(<Harness />);
    return seen;
  };

  it("offers a custom length beyond the 8-clip packages", () => {
    renderPicker("32s");
    const select = screen.getByTestId("duration-select") as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain("__custom__");
    // The packages are still there, named in clips.
    expect(screen.getByText(/4 clips · 32 sec/)).toBeInTheDocument();
  });

  it("lets a standard job be changed to any clip count", () => {
    const seen = renderPicker("32s");
    fireEvent.change(screen.getByTestId("duration-select"), { target: { value: "__custom__" } });
    fireEvent.change(screen.getByTestId("duration-clips"), { target: { value: "15" } });
    expect(seen.at(-1)).toEqual({ duration: "120s", clips: 15 });
  });

  it("opens on the custom box for a job that already has a custom length", () => {
    renderPicker("120s");
    expect((screen.getByTestId("duration-clips") as HTMLInputElement).value).toBe("15");
    expect(screen.getByTestId("duration-readback")).toHaveTextContent("15 clips · 2 min");
  });

  it("does not change the length just by opening the custom box", () => {
    // Opening the box is not an edit. It carries the current length over, ready to be changed.
    const seen = renderPicker("64s");
    fireEvent.change(screen.getByTestId("duration-select"), { target: { value: "__custom__" } });
    expect(seen).toHaveLength(0);
    expect((screen.getByTestId("duration-clips") as HTMLInputElement).value).toBe("8");
  });

  it("opens the custom box even when the current length matches a package", () => {
    // The trap: from a standard 4-clip job, "Custom" leaves the value at "32s". Deriving the mode
    // from the value alone would then decide nothing had happened and never show the box.
    renderPicker("32s");
    fireEvent.change(screen.getByTestId("duration-select"), { target: { value: "__custom__" } });
    expect(screen.getByTestId("duration-clips")).toBeInTheDocument();
  });

  it("goes back to the packages when a standard one is picked again", () => {
    const seen = renderPicker("120s");
    fireEvent.change(screen.getByTestId("duration-select"), { target: { value: "32s" } });
    expect(seen.at(-1)).toEqual({ duration: "32s", clips: 4 });
    expect(screen.queryByTestId("duration-clips")).not.toBeInTheDocument();
  });

  it("refuses a zero-clip ad", () => {
    const seen = renderPicker("120s");
    fireEvent.change(screen.getByTestId("duration-clips"), { target: { value: "0" } });
    expect(seen.at(-1)!.clips).toBe(1);
  });

  it("still lists every standard package for the category", () => {
    renderPicker("16s");
    const select = screen.getByTestId("duration-select") as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    DURATIONS.promotional.forEach((d) => expect(values).toContain(d));
  });
});

/**
 * "Other occasion…" was unusable: choosing it set the occasion to "", and the text box rendered
 * only when the occasion was non-empty, so the box never appeared and the dropdown snapped back
 * to "Not specified". Every occasion outside the festival list — birthdays, weddings, openings,
 * invitations, which is most of what is actually sold — was unreachable.
 */
describe("the occasion a wishes video is for", () => {
  const renderPicker = (initial: string) => {
    const seen: string[] = [];
    const Harness = () => {
      const [value, setValue] = useState(initial);
      return <OccasionPicker value={value} onChange={(n) => { seen.push(n); setValue(n); }} />;
    };
    render(<Harness />);
    return seen;
  };

  it("shows the box to type in as soon as Other is chosen", () => {
    renderPicker("");
    expect(screen.queryByTestId("occasion-custom")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("occasion-select"), { target: { value: "__other__" } });
    expect(screen.getByTestId("occasion-custom")).toBeInTheDocument();
  });

  it("keeps what was typed, instead of snapping back to Not specified", () => {
    const seen = renderPicker("");
    fireEvent.change(screen.getByTestId("occasion-select"), { target: { value: "__other__" } });
    fireEvent.change(screen.getByTestId("occasion-custom"), { target: { value: "Sashtiabdapoorthi" } });

    expect(seen.at(-1)).toBe("Sashtiabdapoorthi");
    expect((screen.getByTestId("occasion-custom") as HTMLInputElement).value).toBe("Sashtiabdapoorthi");
    expect((screen.getByTestId("occasion-select") as HTMLSelectElement).value).toBe("__other__");
  });

  it("re-opens an off-list occasion in the box that holds it", () => {
    renderPicker("Sashtiabdapoorthi");
    expect((screen.getByTestId("occasion-custom") as HTMLInputElement).value).toBe("Sashtiabdapoorthi");
  });

  it("offers the functions and invitations people actually buy", () => {
    renderPicker("");
    const values = [...(screen.getByTestId("occasion-select") as HTMLSelectElement).options].map((o) => o.value);
    ["Birthday", "Wedding", "Housewarming (Gruhapravesam)", "Shop Opening", "Wedding Invitation", "Function Invitation"]
      .forEach((o) => expect(values).toContain(o));
    // …without losing the festivals it already had.
    ["Diwali", "Sankranthi", "Ugadi"].forEach((o) => expect(values).toContain(o));
  });

  it("picking a listed occasion closes the custom box again", () => {
    const seen = renderPicker("Sashtiabdapoorthi");
    fireEvent.change(screen.getByTestId("occasion-select"), { target: { value: "Diwali" } });
    expect(seen.at(-1)).toBe("Diwali");
    expect(screen.queryByTestId("occasion-custom")).not.toBeInTheDocument();
  });

  it("counts every grouped occasion as a listed one", () => {
    // The flat list is derived from the groups, so the dropdown and this check cannot disagree.
    WISHES_OCCASION_GROUPS.flatMap((g) => g.options).forEach((o) => {
      expect(WISHES_FESTIVALS).toContain(o);
      expect(isListedFestival(o)).toBe(true);
    });
    expect(isListedFestival("Sashtiabdapoorthi")).toBe(false);
  });
});

/**
 * The header band's height was one soft clause ("about the top 7%") inside a paragraph that also
 * said the band "FILLS the top of the frame COMPLETELY" and called the business name "the visual
 * hero". An image model resolving that drew a header two or three times too tall.
 */
describe("the ad header's height", () => {
  const prompt = () => HEADER_SYSTEM_PROMPT("promotional", "", false, "ACME");

  it("states the ceiling in percent and in pixels", () => {
    expect(prompt()).toContain(`TOP ${HEADER_BAND_PERCENT}% OF THE FRAME HEIGHT`);
    expect(prompt()).toContain("134 px");
  });

  it("says what to do when the content will not fit — shrink it, never grow the band", () => {
    expect(prompt()).toMatch(/SHRINK THE CONTENTS/);
    expect(prompt()).toMatch(/NEVER grow the band/);
  });

  it("no longer tells the model to fill the top of the frame completely", () => {
    // The exact sentence that outweighed the 7%.
    expect(prompt()).not.toContain("FILLS the top of the frame COMPLETELY");
    expect(prompt()).toContain("WIDTH ONLY");
  });

  it("repeats the bound as the closing instruction", () => {
    const closing = prompt().slice(-600);
    expect(closing).toContain(`TOP ${HEADER_BAND_PERCENT}% ONLY`);
  });

  it("holds for a no-logo header too", () => {
    const noLogo = HEADER_SYSTEM_PROMPT("promotional", "", true, "");
    expect(noLogo).toContain(`TOP ${HEADER_BAND_PERCENT}% OF THE FRAME HEIGHT`);
  });
});
