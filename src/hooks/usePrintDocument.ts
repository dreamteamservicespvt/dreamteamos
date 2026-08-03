/**
 * Print the rendered document a ref points at.
 *
 * A hook rather than a copied handler because there are seven places a document can be looked at,
 * and each of them needs the same three things: a busy flag so the button cannot be pressed twice
 * while the dialog is opening, a guard for the ref not being mounted yet, and an error that
 * surfaces as a toast rather than as silence.
 *
 * Printing is offered alongside downloading, not instead of it. The download photographs the page
 * into an image per sheet — identical everywhere, and a file whose text cannot be selected. Print
 * hands the browser real text: crisper on paper, far smaller if saved as a PDF from the dialog,
 * and copyable. Which of the two is right depends on what the person is about to do with it.
 */
import { useCallback, useState } from "react";
import type { RefObject } from "react";
import { useToast } from "@/hooks/use-toast";
import { printAgreementElement } from "@/utils/agreementPrint";

export function usePrintDocument(paperRef: RefObject<HTMLElement>) {
  const { toast } = useToast();
  const [printing, setPrinting] = useState(false);

  const print = useCallback(async () => {
    if (printing) return;
    if (!paperRef.current) {
      // The preview is collapsed — there is nothing rendered to print.
      toast({ title: "Open the document first", description: "Preview it, then print." });
      return;
    }
    setPrinting(true);
    try {
      await printAgreementElement(paperRef.current);
    } catch {
      toast({ title: "Error", description: "Could not open the print dialog.", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  }, [paperRef, printing, toast]);

  return { printing, print };
}
