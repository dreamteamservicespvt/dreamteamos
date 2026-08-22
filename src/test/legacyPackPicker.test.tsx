import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, render, screen } from "@testing-library/react";
import SpecialCategoryFields from "@/components/work/SpecialCategoryFields";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
configure({ testIdAttribute: "data-test" });

/**
 * A job saved before the catalogue existed, opened in the picker that replaced it.
 *
 * Every sale, order and assignment made until now stores the pack id `motu_patlu`. The catalogue
 * calls that same pack `duo_motu_patlu`, and the dropdown is built from catalogue ids — so the
 * `<select>` is handed a value none of its `<option>`s carry. A browser resolves that by selecting
 * NOTHING, which means an admin opening a real Motu & Patlu job sees an empty Special Category and
 * every reason to believe the category was lost.
 */
describe("a legacy pack id in the picker", () => {
  afterEach(cleanup);

  it("shows the job's real category rather than an empty box", () => {
    render(
      <SpecialCategoryFields
        characterPack="motu_patlu"
        realLocationProvided={false}
        onChange={() => {}}
      />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    // The bug: selectedIndex === -1 (nothing selected) or "" (Normal ad) for a job that plainly
    // has a character pack on it.
    expect(select.selectedIndex).toBeGreaterThanOrEqual(0);
    expect(select.value).not.toBe("");
    // …and it resolves to the pack it actually is.
    expect(select.value).toBe("duo_motu_patlu");
  });

  it("still shows the explainer for the resolved pack", () => {
    render(
      <SpecialCategoryFields
        characterPack="motu_patlu"
        realLocationProvided={false}
        onChange={() => {}}
      />,
    );
    // The <option> also carries the name, so match the explainer specifically — it is the part
    // that disappears when the select resolves to nothing.
    expect(screen.getByText(/Both characters speak in every clip/)).toBeTruthy();
  });

  it("leaves a normal ad on the empty option", () => {
    render(
      <SpecialCategoryFields characterPack="" realLocationProvided={false} onChange={() => {}} />,
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });
});

