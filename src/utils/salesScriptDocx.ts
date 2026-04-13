import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TableRow,
  TableCell,
  Table,
  WidthType,
  ShadingType,
} from "docx";
import { saveAs } from "file-saver";

/* ─── color palette (hex, no #) ─── */
const BRAND_PRIMARY = "6D28D9"; // purple-700
const BRAND_DARK = "1E1B4B";   // indigo-950
const ACCENT_BG = "F5F3FF";    // purple-50
const TIP_BG = "ECFDF5";       // green-50
const TIP_BORDER = "10B981";   // green-500
const BORDER_GRAY = "E5E7EB";  // gray-200
const TEXT_MUTED = "6B7280";    // gray-500
const TABLE_HEADER_BG = "EDE9FE"; // purple-100

/* ─── helpers ─── */
function spacer(size = 120): Paragraph {
  return new Paragraph({ spacing: { after: size } });
}

function divider(): Paragraph {
  return new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_GRAY },
    },
    spacing: { after: 200 },
  });
}

/** Walk a DOM node tree and produce TextRun[] with bold / italic preserved. */
function domToTextRuns(node: Node, inheritBold = false, inheritItalic = false): TextRun[] {
  const runs: TextRun[] = [];

  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text.trim()) {
        runs.push(
          new TextRun({
            text,
            bold: inheritBold,
            italics: inheritItalic,
            size: 22, // 11pt
            font: "Calibri",
          })
        );
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const isBold = inheritBold || tag === "strong" || tag === "b";
      const isItalic = inheritItalic || tag === "em" || tag === "i";
      runs.push(...domToTextRuns(el, isBold, isItalic));
    }
  });

  return runs;
}

/** Extract structured content from a rendered section container div. */
function extractSectionContent(container: HTMLElement): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = [];

  container.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    // Table
    if (el.tagName === "DIV" && el.querySelector("table")) {
      const table = el.querySelector("table")!;
      paragraphs.push(...convertTableToDocx(table));
      return;
    }

    // Tip box (has AlertCircle icon + text)
    if (el.classList.contains("bg-primary/10") || el.classList.toString().includes("bg-primary")) {
      const text = el.innerText.replace(/^\s*⚠?\s*/, "").trim();
      if (text) {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.CLEAR, fill: TIP_BG },
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: TIP_BORDER },
            },
            indent: { left: 200 },
            children: [
              new TextRun({ text: "Tip: ", size: 22, font: "Calibri", bold: true, color: "047857" }),
              new TextRun({ text, size: 20, font: "Calibri", italics: true, color: "047857" }),
            ],
          })
        );
      }
      return;
    }

    // Label (uppercase tracking-wide)
    if (el.classList.contains("uppercase") || el.classList.toString().includes("tracking-wide")) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 240, after: 60 },
          children: [
            new TextRun({
              text: el.innerText.trim(),
              bold: true,
              size: 22,
              font: "Calibri",
              color: BRAND_PRIMARY,
              allCaps: true,
            }),
          ],
        })
      );
      return;
    }

    // Card-style blocks (bg-card border)
    if (el.classList.toString().includes("bg-card") || el.classList.toString().includes("border-border")) {
      // Walk children inside the card
      el.childNodes.forEach((cardChild) => {
        if (cardChild.nodeType === Node.ELEMENT_NODE) {
          const ccEl = cardChild as HTMLElement;
          const runs = domToTextRuns(ccEl);
          if (runs.length) {
            paragraphs.push(
              new Paragraph({
                spacing: { before: 40, after: 40 },
                indent: { left: 300 },
                children: runs,
              })
            );
          }
        }
      });
      return;
    }

    // Regular paragraph
    const runs = domToTextRuns(el);
    if (runs.length) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          children: runs,
        })
      );
    }
  });

  return paragraphs;
}

function convertTableToDocx(tableEl: HTMLTableElement): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];

  const rows: TableRow[] = [];
  const allRows = tableEl.querySelectorAll("tr");
  let columnCount = 0;

  allRows.forEach((tr, rowIdx) => {
    const cells: TableCell[] = [];
    const isHeader = rowIdx === 0 && tr.closest("thead") !== null;

    tr.querySelectorAll("th, td").forEach((cell) => {
      cells.push(
        new TableCell({
          shading: isHeader
            ? { type: ShadingType.CLEAR, fill: TABLE_HEADER_BG }
            : undefined,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: (cell as HTMLElement).innerText.trim(),
                  bold: isHeader,
                  size: 20,
                  font: "Calibri",
                }),
              ],
            }),
          ],
        })
      );
    });

    if (cells.length) {
      if (cells.length > columnCount) columnCount = cells.length;
      rows.push(new TableRow({ children: cells }));
    }
  });

  if (rows.length) {
    result.push(spacer(80));
    result.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
    result.push(spacer(80));
  }

  return result;
}

/* ─── Public API ─── */

export interface SectionData {
  title: string;
  contentEl: HTMLElement | null;
}

export interface TabDownloadData {
  label: string;
  sections: SectionData[];
}

export async function generateSalesScriptDocx(
  tabsData: TabDownloadData[],
  meta: { greeting: string; userName: string; festivalName: string }
) {
  const children: (Paragraph | Table)[] = [];

  // ── Title page content ──
  children.push(spacer(400));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "DREAM TEAM",
          bold: true,
          size: 48,
          font: "Calibri",
          color: BRAND_PRIMARY,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "Sales Scripts",
          bold: true,
          size: 36,
          font: "Calibri",
          color: BRAND_DARK,
        }),
      ],
    })
  );
  children.push(divider());
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Generated: ", size: 20, font: "Calibri", color: TEXT_MUTED }),
        new TextRun({
          text: new Date().toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          bold: true,
          size: 20,
          font: "Calibri",
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Greeting: ", size: 20, font: "Calibri", color: TEXT_MUTED }),
        new TextRun({ text: `Good ${meta.greeting}`, bold: true, size: 20, font: "Calibri" }),
        new TextRun({ text: "  |  Name: ", size: 20, font: "Calibri", color: TEXT_MUTED }),
        new TextRun({ text: meta.userName, bold: true, size: 20, font: "Calibri" }),
        new TextRun({ text: "  |  Festival: ", size: 20, font: "Calibri", color: TEXT_MUTED }),
        new TextRun({ text: meta.festivalName, bold: true, size: 20, font: "Calibri" }),
      ],
    })
  );

  // ── Scripts included list ──
  children.push(spacer(200));
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "Scripts Included:",
          bold: true,
          size: 24,
          font: "Calibri",
          color: BRAND_DARK,
        }),
      ],
    })
  );
  tabsData.forEach((tab, i) => {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        indent: { left: 300 },
        children: [
          new TextRun({
            text: `${i + 1}. ${tab.label}`,
            size: 22,
            font: "Calibri",
          }),
        ],
      })
    );
  });

  // ── Each tab ──
  tabsData.forEach((tab) => {
    children.push(spacer(300));

    // Tab heading — purple background bar
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 120 },
        shading: { type: ShadingType.CLEAR, fill: BRAND_PRIMARY },
        children: [
          new TextRun({
            text: `  ${tab.label.toUpperCase()}`,
            bold: true,
            size: 28,
            font: "Calibri",
            color: "FFFFFF",
          }),
        ],
      })
    );

    tab.sections.forEach((section) => {
      // Section title
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_GRAY },
          },
          children: [
            new TextRun({
              text: section.title,
              bold: true,
              size: 24,
              font: "Calibri",
              color: BRAND_DARK,
            }),
          ],
        })
      );

      // Section content from rendered DOM
      if (section.contentEl) {
        const blocks = extractSectionContent(section.contentEl);
        children.push(...blocks);
      }

      children.push(spacer(80));
    });
  });

  // ── Build document ──
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 },
          },
        },
        children: children as (Paragraph | Table)[],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = tabsData.length === 1
    ? `${tabsData[0].label.replace(/\s+/g, "-").toLowerCase()}-sales-script.docx`
    : "sales-scripts-all.docx";
  saveAs(blob, filename);
}
