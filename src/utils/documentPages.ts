import { normalizeSignatureUrl } from "@/utils/signatureImage";

/**
 * Laying a rendered document out into real A4 pages.
 *
 * Shared by the PDF export and the print path, and that sharing is the point. Print used to take a
 * different route — one long flow with the letterhead `position: fixed` so it would repeat — and
 * CSS can only reserve space for a fixed band at the *start* of a flow, not on every page. So the
 * title printed underneath the letterhead and the last line of each page printed underneath the
 * footer. There is no version of that approach that works; the fix is to build the pages.
 *
 * Blocks (title, reference block, each paragraph, each signature) are distributed into fixed-height
 * sheets, and a block that would cross a boundary moves to the next sheet whole — so no line of
 * text is ever cut in half. Every sheet carries its own copy of the letterhead and foot rule, which
 * is why they can never overlap anything.
 */

/** A4 at 96dpi, in CSS px. */
export const PAGE_W = 794;
export const PAGE_H = 1123;

/** Space under the foot rule, so a descender never touches the page-number line. */
const FOOT_GAP = 14;

/**
 * Clear space between the last line and the foot rule.
 *
 * Taken off the column by pushing the footer down, NOT by relaxing the overflow test.
 * `scrollHeight` is defined as at least `clientHeight`, so `scrollHeight > clientHeight - safety`
 * is true even for an empty column — that version broke every block onto its own page and turned a
 * three-page letter into thirty-seven.
 */
const BOTTOM_SAFETY = 18;

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/** Replace signature imgs with background-stripped data-URLs where they can be re-fetched. */
async function normalizeSignatureImgs(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-signature]"));
  await Promise.all(
    imgs.map(async (img) => {
      const clean = await normalizeSignatureUrl(img.src);
      if (clean) {
        img.src = clean;
        img.classList.remove("mix-blend-multiply"); // already clean; html2canvas ignores blends anyway
      }
    }),
  );
}

export interface PaginatedDocument {
  /** One element per A4 sheet, in order, already attached to `stage`. */
  pages: HTMLElement[];
  /** The off-screen host holding them. The caller removes it when finished. */
  stage: HTMLElement;
}

/**
 * Lay a rendered document out into A4 sheets.
 *
 * The sheets are built inside an off-screen stage so they can be measured; the caller either
 * rasterizes them (PDF) or moves them somewhere printable (print), then removes the stage.
 */
export async function paginateDocument(paperEl: HTMLElement): Promise<PaginatedDocument> {
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-20000px;top:0;z-index:-1;";
  document.body.appendChild(stage);

  // 1) Clone the on-screen paper at a fixed A4 width so measurements match the output.
  const src = paperEl.cloneNode(true) as HTMLElement;
  src.classList.remove("max-w-[820px]", "mx-auto", "shadow-sm");
  src.style.width = `${PAGE_W}px`;
  src.style.maxWidth = "none";
  const measureWrap = document.createElement("div");
  measureWrap.style.cssText = `width:${PAGE_W}px;background:#fff;`;
  measureWrap.appendChild(src);
  stage.appendChild(measureWrap);

  await normalizeSignatureImgs(src);
  await waitForImages(src);

  // 2) The furniture that repeats on every sheet, and the blocks that flow between them.
  const letterhead = src.querySelector<HTMLElement>('[data-pdf="letterhead"]');
  const letterfoot = src.querySelector<HTMLElement>('[data-pdf="letterfoot"]');
  const title = src.querySelector<HTMLElement>('[data-pdf="title"]');
  const headerBlock = src.querySelector<HTMLElement>('[data-pdf="header-block"]');
  const bodyEl = src.querySelector<HTMLElement>('[data-pdf="body"]');
  const footer = src.querySelector<HTMLElement>('[data-pdf="footer"]');

  const blocks: HTMLElement[] = [];
  if (title) blocks.push(title);
  if (headerBlock) blocks.push(headerBlock);
  if (bodyEl) blocks.push(...(Array.from(bodyEl.children) as HTMLElement[]));
  if (footer) blocks.push(footer);
  if (blocks.length === 0) blocks.push(src); // fallback: the whole paper as one block

  const paperClasses = paperEl.className
    .replace("max-w-[820px]", "")
    .replace("mx-auto", "")
    .replace("shadow-sm", "");

  const pages: HTMLElement[] = [];

  /**
   * A sheet: letterhead at the top, foot rule at the bottom, content flexing between them.
   *
   * The paper's OWN inline styles come first — above all, its text colour. A sheet is a fresh div,
   * so it starts with none of them, and the document sets its ink inline while ordinary paragraphs
   * only inherit it. Dropped here, those paragraphs fall back to inheriting from `<body>`, which in
   * the app's dark theme is near-white: every heading solid and every sentence a ghost.
   */
  const newPage = (): HTMLElement => {
    const page = document.createElement("div");
    page.className = paperClasses;
    page.setAttribute("data-document-page", "true");
    page.style.cssText = [
      src.style.cssText,
      `width:${PAGE_W}px`, `height:${PAGE_H}px`,
      "overflow:hidden", "box-shadow:none", "color-scheme:light", "background:#ffffff",
      "display:flex", "flex-direction:column",
    ].filter(Boolean).join(";");

    if (letterhead) {
      const head = letterhead.cloneNode(true) as HTMLElement;
      head.style.flex = "0 0 auto";
      page.appendChild(head);
    }

    const inner = document.createElement("div");
    inner.className = bodyEl?.className || "";
    inner.style.cssText = "flex:1 1 auto;min-height:0;";
    if (bodyEl) {
      // Carry the body's own type settings, so a paragraph reads the same on sheet 3 as sheet 1.
      inner.style.fontSize = bodyEl.style.fontSize;
      inner.style.lineHeight = bodyEl.style.lineHeight;
    }
    page.appendChild(inner);

    if (letterfoot) {
      const foot = letterfoot.cloneNode(true) as HTMLElement;
      foot.style.flex = "0 0 auto";
      foot.style.marginTop = `${BOTTOM_SAFETY}px`;
      foot.style.paddingBottom = `${FOOT_GAP}px`;
      page.appendChild(foot);
    }

    stage.appendChild(page);
    pages.push(page);
    return inner;
  };

  /**
   * Blocks that must not be the last thing on a sheet.
   *
   * A heading stranded at the foot of a page with its clause overleaf is the classic printing
   * fault. Blank spacers count too: a sheet ending in whitespace has wasted the room the next
   * paragraph needed.
   */
  const keepWithNext = (el: Element | null): boolean => {
    if (!el) return false;
    if (el.getAttribute("data-pdf") === "heading") return true;
    return (el.textContent || "").trim() === "";
  };

  let inner = newPage();
  for (const block of blocks) {
    inner.appendChild(block);
    // Overflowing its own flex box — not the sheet — is what "does not fit" means once a header
    // and a footer are taking up part of every page.
    if (inner.scrollHeight > inner.clientHeight && inner.children.length > 1) {
      const previous = inner;
      previous.removeChild(block);

      const carried: Element[] = [];
      while (previous.children.length > 1 && keepWithNext(previous.lastElementChild)) {
        carried.unshift(previous.removeChild(previous.lastElementChild!));
      }

      inner = newPage();
      carried.forEach((el) => inner.appendChild(el));
      inner.appendChild(block);
    }
  }

  measureWrap.remove();
  return { pages, stage };
}
