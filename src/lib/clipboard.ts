/**
 * Copies text, falling back to the old textarea route where the Clipboard API is refused (older
 * WebViews, the Android app). Resolves false when neither worked, so the caller can say so.
 * Moved here from DriveUploadSheet (2026-10-10) when AI Accounts' API keys needed the same.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: the textarea route still works where the Clipboard API is refused.
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Saves text as a file in the browser's downloads (a .env of API keys). */
export function downloadText(fileName: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
