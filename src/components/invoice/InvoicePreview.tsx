/**
 * The live preview: the invoice as real A4 sheets, scaled to fit, updating as the person types.
 *
 * How a sheet break is decided: every block is rendered once, off-screen, at the sheet's exact
 * content width (`InvoiceMeasure`); their heights go to `planInvoicePages`; the sheets on screen are
 * that plan. Measured again whenever the content changes and whenever a web font finishes loading
 * (Inter arriving late changes line breaks).
 *
 * `capturePages()` renders the same plan at full size, off-screen, for the PDF and print — so the
 * downloaded file breaks exactly where the preview does.
 */
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { planInvoicePages, type InvoicePagePlan } from "@/utils/invoiceLayout";
import {
  FIRST_PAGE_HEIGHT, InvoiceMeasure, InvoicePage, NEXT_PAGE_HEIGHT, PAGE_H, PAGE_W, type PaperModel,
} from "@/components/invoice/InvoicePaper";

export interface InvoicePreviewHandle {
  /** Full-size sheets for export. Call `done()` when finished with them. */
  capturePages: () => Promise<{ pages: HTMLElement[]; done: () => void }>;
}

interface Props {
  model: PaperModel;
  /** Gap and padding around the sheets, px. */
  padding?: number;
  className?: string;
  onPageCount?: (count: number) => void;
}

const OFFSCREEN: React.CSSProperties = { position: "fixed", left: -30000, top: 0, pointerEvents: "none" };

function samePlan(a: InvoicePagePlan[], b: InvoicePagePlan[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function initialPlan(model: PaperModel): InvoicePagePlan[] {
  return [{
    intro: true,
    tableHead: true,
    rows: (model.printedRows.length ? model.printedRows : [0]).map((_, i) => i),
    after: model.after.map((b) => b.key),
  }];
}

const InvoicePreview = forwardRef<InvoicePreviewHandle, Props>(function InvoicePreview(
  { model, padding = 24, className, onPageCount },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<InvoicePagePlan[]>(() => initialPlan(model));
  const [width, setWidth] = useState(0);
  const [fontsTick, setFontsTick] = useState(0);
  const [staging, setStaging] = useState(false);
  const stageWaiter = useRef<((pages: HTMLElement[]) => void) | null>(null);

  // Re-measure when web fonts land.
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts) return;
    let alive = true;
    const bump = () => { if (alive) setFontsTick((t) => t + 1); };
    fonts.ready.then(bump).catch(() => undefined);
    fonts.load?.('500 12px "Inter"').then(bump).catch(() => undefined);
    fonts.addEventListener?.("loadingdone", bump);
    return () => { alive = false; fonts.removeEventListener?.("loadingdone", bump); };
  }, []);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const heightOf = (el: Element | null) => (el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    const rows = Array.from(root.querySelectorAll('[data-block="row"]')).map(heightOf);
    const next = planInvoicePages({
      firstPageHeight: FIRST_PAGE_HEIGHT,
      nextPageHeight: NEXT_PAGE_HEIGHT,
      intro: heightOf(root.querySelector('[data-block="intro"]')),
      tableHead: heightOf(root.querySelector('[data-block="thead"]')),
      rows,
      after: model.after.map((b) => ({
        key: b.key,
        keepWithNext: b.keepWithNext,
        keepWithRows: b.keepWithRows,
        height: heightOf(root.querySelector(`[data-block="after"][data-key="${b.key}"]`)),
      })),
    });
    setPlan((prev) => (samePlan(prev, next) ? prev : next));
  }, [model, fontsTick]);

  useEffect(() => { onPageCount?.(plan.length); }, [plan.length, onPageCount]);

  // Scale the sheets to the space this panel has.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The export stage: resolve the waiting capture once the full-size sheets are on the page.
  useEffect(() => {
    if (!staging || !stageWaiter.current) return;
    const resolveWith = stageWaiter.current;
    stageWaiter.current = null;
    requestAnimationFrame(() => {
      const pages = Array.from(stageRef.current?.querySelectorAll<HTMLElement>("[data-invoice-page]") || []);
      resolveWith(pages);
    });
  }, [staging]);

  useImperativeHandle(ref, () => ({
    capturePages: () => new Promise((resolve) => {
      stageWaiter.current = (pages) => resolve({ pages, done: () => setStaging(false) });
      setStaging(true);
    }),
  }), []);

  const scale = width > 0 ? Math.min(1, (width - padding * 2) / PAGE_W) : 0;

  return (
    <div ref={hostRef} className={className} data-test="invoice-preview">
      {scale > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: padding, padding }}>
          {plan.map((p, i) => (
            <div
              key={i}
              data-test="invoice-sheet"
              style={{
                width: PAGE_W * scale, height: PAGE_H * scale, flex: "0 0 auto",
                borderRadius: 6, overflow: "hidden", background: "#ffffff",
                boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 8px 28px -6px rgba(15,23,42,0.18)",
              }}
            >
              <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <InvoicePage model={model} plan={p} index={i} count={plan.length} />
              </div>
            </div>
          ))}
        </div>
      )}

      {typeof document !== "undefined" && createPortal(
        <div ref={measureRef} aria-hidden style={{ ...OFFSCREEN, visibility: "hidden" }}>
          <InvoiceMeasure model={model} />
        </div>,
        document.body,
      )}

      {staging && typeof document !== "undefined" && createPortal(
        <div ref={stageRef} aria-hidden style={{ ...OFFSCREEN, zIndex: -1 }}>
          {plan.map((p, i) => <InvoicePage key={i} model={model} plan={p} index={i} count={plan.length} />)}
        </div>,
        document.body,
      )}
    </div>
  );
});

export default InvoicePreview;
