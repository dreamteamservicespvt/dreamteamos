import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import PosterSpecFields, { type PosterSpecPatch } from "@/components/work/PosterSpecFields";
import ModelAttireFields from "@/components/work/ModelAttireFields";
import RequirementsShareModal from "@/components/work/RequirementsShareModal";
import { AttireType, ModelGender } from "@/types/aiPlatform";

configure({ testIdAttribute: "data-test" });

/**
 * The shared form pieces the four pages now use. The logic under them is tested elsewhere; these
 * pin what a person clicking actually gets — the thing that went wrong in the screenshot was a
 * field that was simply not on the form.
 */

function PosterHarness({ onPatch }: { onPatch?: (p: PosterSpecPatch) => void }) {
  const [state, setState] = useState({ posterSize: "4:5", posterStyle: "auto", occasion: "", posterCount: 1 });
  return (
    <PosterSpecFields
      {...state}
      showCount
      today={new Date("2026-09-11T10:00:00")}
      onChange={(patch) => {
        onPatch?.(patch);
        setState((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

describe("PosterSpecFields", () => {
  afterEach(cleanup);

  it("opens on 4:5 and switches presets", () => {
    render(<PosterHarness />);
    expect(screen.getByTestId("poster-size-summary").textContent).toContain("4:5 · 1080×1350 px");
    fireEvent.click(screen.getByTestId("poster-size-9:16"));
    expect(screen.getByTestId("poster-size-summary").textContent).toContain("9:16 · 1080×1920 px");
  });

  it("takes a custom ratio, then custom pixels, and refuses nonsense", () => {
    const patches: PosterSpecPatch[] = [];
    render(<PosterHarness onPatch={(p) => patches.push(p)} />);
    fireEvent.click(screen.getByTestId("poster-size-custom"));
    fireEvent.change(screen.getByTestId("poster-ratio-w"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("poster-ratio-h"), { target: { value: "3" } });
    expect(screen.getByTestId("poster-size-summary").textContent).toContain("2:3 · 1080×1620 px");

    fireEvent.click(screen.getByTestId("poster-custom-pixels"));
    fireEvent.change(screen.getByTestId("poster-px-w"), { target: { value: "2480" } });
    fireEvent.change(screen.getByTestId("poster-px-h"), { target: { value: "3508" } });
    expect(screen.getByTestId("poster-size-summary").textContent).toContain("2480×3508 px");

    const before = patches.length;
    fireEvent.change(screen.getByTestId("poster-px-h"), { target: { value: "5" } });
    expect(screen.getByText(/between 200 and 10000 px/)).toBeInTheDocument();
    expect(patches.length).toBe(before); // an invalid size is never sent upward
  });

  it("offers every style and explains the one picked", () => {
    render(<PosterHarness />);
    for (const id of ["auto", "animal_metaphor", "shape_concept", "product_benefit", "contrast_concept", "proportion_concept", "visual_exaggeration", "shadow_metaphor", "material_metaphor"]) {
      expect(screen.getByTestId(`poster-style-${id}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId("poster-style-shadow_metaphor"));
    expect(screen.getByTestId("poster-style-explainer").textContent).toMatch(/Shadow metaphor/);
  });

  it("lists upcoming occasions soonest first, and takes a typed one", () => {
    const patches: PosterSpecPatch[] = [];
    render(<PosterHarness onPatch={(p) => patches.push(p)} />);
    const select = screen.getByTestId("poster-occasion") as HTMLSelectElement;
    const labels = Array.from(select.querySelectorAll("optgroup option")).map((o) => o.textContent || "");
    expect(labels[0]).toMatch(/^Ganesh Chaturthi \(Vinayaka Chavithi\) — Sep 14/);
    expect(labels.some((l) => l.startsWith("Engineers' Day"))).toBe(true);

    fireEvent.change(select, { target: { value: "Engineers' Day" } });
    expect(patches.at(-1)).toEqual({ occasion: "Engineers' Day" });

    fireEvent.change(select, { target: { value: "__custom_occasion__" } });
    fireEvent.change(screen.getByTestId("poster-occasion-custom"), { target: { value: "Shop anniversary" } });
    expect(patches.at(-1)).toEqual({ occasion: "Shop anniversary" });
  });

  it("shows locked fields as fixed", () => {
    render(
      <PosterSpecFields posterSize="1:1" posterStyle="shape_concept" occasion="Diwali" onChange={vi.fn()}
        locked={{ size: true, style: true, occasion: true }} />,
    );
    expect(screen.getAllByText(/Fixed by assignment/)).toHaveLength(3);
    expect(screen.queryByTestId("poster-size-4:5")).toBeNull();
  });
});

describe("ModelAttireFields", () => {
  afterEach(cleanup);

  it("an ordinary ad offers Model and Attire", () => {
    render(<ModelAttireFields characterPack="" modelGender={ModelGender.MALE} attireType={AttireType.SHIRT_PANT} customAttire="" onChange={vi.fn()} />);
    expect(screen.getByTestId("model-female")).toBeInTheDocument();
    const options = Array.from((screen.getByTestId("attire-select") as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(["professional", "shirt_pant", "custom"]);
  });

  it("Normal Ad (Female) keeps Attire — with the female options — and drops the Model toggle", () => {
    const onChange = vi.fn();
    render(<ModelAttireFields characterPack="normal_female" modelGender={ModelGender.MALE} attireType={AttireType.SHIRT_PANT} customAttire="" onChange={onChange} />);
    expect(screen.queryByTestId("model-female")).toBeNull();
    const select = screen.getByTestId("attire-select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["professional", "traditional", "custom"]);
    expect(screen.getByText(/set by Normal Ad \(Female\)/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "traditional" } });
    expect(onChange).toHaveBeenCalledWith({ attireType: "traditional", modelGender: "female" });
  });

  it("a deity or a cartoon comes dressed — nothing is rendered", () => {
    const { container } = render(<ModelAttireFields characterPack="god_ganesha" modelGender={ModelGender.FEMALE} attireType={AttireType.TRADITIONAL} customAttire="" onChange={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("asks for the description when Custom is picked", () => {
    render(<ModelAttireFields characterPack="normal_male" modelGender={ModelGender.MALE} attireType={AttireType.CUSTOM} customAttire="chef coat" onChange={vi.fn()} />);
    expect((screen.getByTestId("attire-custom") as HTMLInputElement).value).toBe("chef coat");
  });
});

describe("RequirementsShareModal", () => {
  afterEach(cleanup);

  it("takes the business info when it arrives from the order, until someone edits the text", () => {
    const { rerender } = render(<RequirementsShareModal memberName="Anjali" message="first" loading onClose={vi.fn()} />);
    expect(screen.getByText(/Adding the business info from the sale/)).toBeInTheDocument();
    rerender(<RequirementsShareModal memberName="Anjali" message="first + business info" onClose={vi.fn()} />);
    const box = screen.getByTestId("requirements-text") as HTMLTextAreaElement;
    expect(box.value).toBe("first + business info");

    fireEvent.change(box, { target: { value: "my own edit" } });
    rerender(<RequirementsShareModal memberName="Anjali" message="something newer" onClose={vi.fn()} />);
    expect(box.value).toBe("my own edit");
  });
});
