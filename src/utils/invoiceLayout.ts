/**
 * Laying an invoice out on A4 sheets — the page plan the preview, the PDF and the print all share.
 *
 * The preview measures every block of the rendered invoice once (the heading, the table header,
 * each item row, the totals, the payment details, each paragraph of the terms and notes), hands the
 * heights to `planInvoicePages`, and renders exactly the sheets it gets back. The PDF photographs
 * those same sheets and the print dialog receives them, so a page break can never land somewhere
 * else in the file than it does on screen.
 *
 * The rules, in the order they matter on a real invoice:
 *  1. An item row is never cut in half — it moves to the next sheet whole.
 *  2. Every sheet that carries rows starts with the table header, so page 2 still says what the
 *     columns are.
 *  3. The table header is never the last thing on a sheet.
 *  4. The totals never sit alone at the top of a sheet with nothing above them to total: if they do
 *     not fit, the last row goes over with them.
 *  5. A heading ("Terms & conditions") is kept with the paragraph after it (`keepWithNext`).
 *  6. A block too tall for any sheet still gets one to itself rather than looping forever.
 *
 * Heights are CSS px at A4's 96-dpi width (794 × 1123). Pure.
 */

export interface InvoiceLayoutBlock {
  key: string;
  height: number;
  /** Must share a sheet with the block that follows it (a heading). */
  keepWithNext?: boolean;
  /** If it has to move to a new sheet, take the last item row with it (the totals). */
  keepWithRows?: boolean;
}

export interface InvoiceLayoutInput {
  /** Usable height of sheet 1 below its top margin and above its footer. */
  firstPageHeight: number;
  /** Usable height of every later sheet, below its continuation header. */
  nextPageHeight: number;
  /** The invoice heading and parties — sheet 1 only. */
  intro: number;
  tableHead: number;
  rows: number[];
  /** Everything after the table, in order. */
  after: InvoiceLayoutBlock[];
}

export interface InvoicePagePlan {
  intro: boolean;
  tableHead: boolean;
  /** Indexes into `rows`. */
  rows: number[];
  /** Keys of `after` blocks. */
  after: string[];
}

export function planInvoicePages(input: InvoiceLayoutInput): InvoicePagePlan[] {
  const rows = input.rows.map((h) => Math.max(0, h || 0));
  const pages: InvoicePagePlan[] = [];
  let page: InvoicePagePlan = { intro: true, tableHead: false, rows: [], after: [] };
  let room = 0;

  const open = (first: boolean) => {
    page = { intro: first, tableHead: false, rows: [], after: [] };
    pages.push(page);
    room = first ? input.firstPageHeight - input.intro : input.nextPageHeight;
  };
  /** Nothing on it yet — anything placed here stays, fits or not (rule 6). */
  const isFresh = () => !page.intro && page.rows.length === 0 && page.after.length === 0;

  open(true);

  rows.forEach((height, i) => {
    const need = height + (page.tableHead ? 0 : input.tableHead);
    if (need > room && !isFresh()) open(false);
    if (!page.tableHead) {
      page.tableHead = true;
      room -= input.tableHead;
    }
    page.rows.push(i);
    room -= height;
  });

  const after = input.after;
  for (let j = 0; j < after.length; ) {
    let k = j;
    while (k < after.length - 1 && after[k].keepWithNext) k++;
    const chain = after.slice(j, k + 1);
    const height = chain.reduce((s, b) => s + Math.max(0, b.height || 0), 0);

    if (height > room && !isFresh()) {
      if (chain[0].keepWithRows && page.rows.length >= 2 && page.after.length === 0) {
        const carried = page.rows.pop()!;
        open(false);
        page.tableHead = true;
        room -= input.tableHead;
        page.rows.push(carried);
        room -= rows[carried];
      } else {
        open(false);
      }
    }
    for (const block of chain) {
      page.after.push(block.key);
      room -= Math.max(0, block.height || 0);
    }
    j = k + 1;
  }

  return pages;
}
