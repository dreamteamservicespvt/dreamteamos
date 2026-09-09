import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
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

  /**
   * There are two dropdowns on this block now — the pack and the background — so a bare
   * `getByRole("combobox")` matches both. The pack is the first; the background carries a test id.
   */
  const packSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;

  it("shows the job's real category rather than an empty box", () => {
    render(
      <SpecialCategoryFields
        characterPack="motu_patlu"
        realLocationProvided={false}
        onChange={() => {}}
      />,
    );

    const select = packSelect();
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
    expect(packSelect().value).toBe("");
  });
});

/**
 * The background used to be asked only once a pack was chosen, so an ordinary ad had no background
 * question at all and reached the generator as "build the location" whatever the client had been
 * asked to send.
 */
describe("the background question", () => {
  afterEach(cleanup);

  const background = () => screen.getByTestId("assign-background") as HTMLSelectElement;

  it("is asked on a normal ad, not only on a pack one", () => {
    render(<SpecialCategoryFields characterPack="" realLocationProvided={false} onChange={() => {}} />);
    expect(background().value).toBe("ai");
  });

  it("shows the client's own premises when that is what was sold", () => {
    render(<SpecialCategoryFields characterPack="" realLocationProvided onChange={() => {}} />);
    expect(background().value).toBe("real");
    // And says the thing that actually blocks the job.
    expect(screen.getByText(/Nothing can be started until those photos arrive/)).toBeTruthy();
  });

  it("reports the change as a boolean, whichever way it is switched", () => {
    const onChange = vi.fn();
    render(<SpecialCategoryFields characterPack="" realLocationProvided={false} onChange={onChange} />);
    fireEvent.change(background(), { target: { value: "real" } });
    expect(onChange).toHaveBeenCalledWith({ realLocationProvided: true });
  });
});

