import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";

/**
 * What the ad generator will and will not accept.
 *
 * Every one of these refusals exists because the alternative is silent: the pipeline reads images
 * and plain text, so a PDF or a video is uploaded, counted, and contributes nothing — and the
 * member goes on believing the client's brochure was used in the ad. An oversized photo is the same
 * failure with an extra minute of waiting in front of it.
 */

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

const { FileUpload, MAX_IMAGE_MB } = await import("@/components/ai-platform/FileUpload");

configure({ testIdAttribute: "data-test" });
afterEach(cleanup);

/** A File of a given type and size, without actually allocating megabytes. */
function fileOf(name: string, type: string, bytes = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

const MB = 1024 * 1024;

function renderImageSlot() {
  const onChange = vi.fn();
  render(<FileUpload label="Store images" accept="image/*" multiple onChange={onChange} />);
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  return { onChange, input };
}

const notice = () => screen.queryByTestId("pdf-notice")?.textContent || "";

describe("an image slot", () => {
  let ctx: ReturnType<typeof renderImageSlot>;
  beforeEach(() => { ctx = renderImageSlot(); });

  it("takes an ordinary photo", () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("shop.jpg", "image/jpeg", 2 * MB)] } });
    expect(ctx.onChange).toHaveBeenCalled();
    expect(notice()).toBe("");
  });

  it("refuses a video, and says to upload a frame instead", () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("tour.mp4", "video/mp4", 5 * MB)] } });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(notice()).toMatch(/video/i);
    expect(notice()).toMatch(/frame/i);
  });

  it("refuses a video the browser gave no type for, by its extension", () => {
    // Android file pickers hand over an empty `type` surprisingly often.
    fireEvent.change(ctx.input, { target: { files: [fileOf("clip.MOV", "", 5 * MB)] } });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(notice()).toMatch(/video/i);
  });

  it("refuses a PDF, and says to screenshot it", () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("brochure.pdf", "application/pdf")] } });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(notice()).toMatch(/screenshot/i);
  });

  it(`refuses an image over ${MAX_IMAGE_MB}MB, and says how big it was`, () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("huge.jpg", "image/jpeg", 24 * MB)] } });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(notice()).toMatch(/24\.0MB/);
    expect(notice()).toMatch(new RegExp(`under ${MAX_IMAGE_MB}MB`));
  });

  it("takes an image right on the limit", () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("edge.jpg", "image/jpeg", MAX_IMAGE_MB * MB)] } });
    expect(ctx.onChange).toHaveBeenCalled();
    expect(notice()).toBe("");
  });

  it("refuses anything that is not an image at all", () => {
    fireEvent.change(ctx.input, { target: { files: [fileOf("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")] } });
    expect(ctx.onChange).not.toHaveBeenCalled();
    expect(notice()).toMatch(/not an image/i);
  });

  it("keeps the good files out of a mixed selection and names only the bad ones", () => {
    fireEvent.change(ctx.input, {
      target: {
        files: [
          fileOf("good.jpg", "image/jpeg", MB),
          fileOf("tour.mp4", "video/mp4", 5 * MB),
          fileOf("huge.png", "image/png", 30 * MB),
        ],
      },
    });
    const passed = ctx.onChange.mock.calls[0][0] as File[];
    expect(passed.map((f) => f.name)).toEqual(["good.jpg"]);
    expect(notice()).toMatch(/tour\.mp4/);
    expect(notice()).toMatch(/huge\.png/);
    expect(notice()).not.toMatch(/good\.jpg/);
  });
});

describe("the other slots keep their own rules", () => {
  it("still takes a voice recording on the audio slot", () => {
    const onChange = vi.fn();
    render(<FileUpload label="Voice" accept="audio/*" multiple onChange={onChange} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("note.m4a", "audio/mp4", 3 * MB)] } });
    expect(onChange).toHaveBeenCalled();
  });

  it("refuses a video even there — nothing in the pipeline reads one", () => {
    const onChange = vi.fn();
    render(<FileUpload label="Voice" accept="audio/*" multiple onChange={onChange} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("clip.mp4", "video/mp4", 3 * MB)] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still takes a text file on the text slot", () => {
    const onChange = vi.fn();
    render(<FileUpload label="Notes" accept=".txt,.doc,.docx" multiple onChange={onChange} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileOf("brief.txt", "text/plain", 20 * 1024)] } });
    expect(onChange).toHaveBeenCalled();
  });
});
