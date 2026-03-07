import { useState, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  /** If true, show a text input for user to type a reason/note */
  withInput?: boolean;
  inputPlaceholder?: string;
};

type ResolveResult = { confirmed: boolean; inputValue?: string };

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ description: "" });
  const [inputValue, setInputValue] = useState("");
  const resolveRef = useRef<((result: ResolveResult) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<ResolveResult> => {
    setOptions(opts);
    setInputValue("");
    setOpen(true);
    return new Promise<ResolveResult>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolveRef.current?.({ confirmed: true, inputValue: inputValue.trim() });
  }, [inputValue]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolveRef.current?.({ confirmed: false });
  }, []);

  const ConfirmDialog = (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          {options.title && <AlertDialogTitle>{options.title}</AlertDialogTitle>}
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {options.withInput && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={options.inputPlaceholder || "Type here..."}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary outline-none"
            autoFocus
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {options.cancelText || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={options.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {options.confirmText || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
