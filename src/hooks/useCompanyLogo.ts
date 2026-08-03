/**
 * The company logo as a data URL, ready to be captured into a PDF.
 *
 * html2canvas will not draw an image it has to fetch at capture time, so a letterhead whose logo
 * is a plain `/dts-logo-full.png` path renders on screen and comes out as a blank gap in the
 * downloaded file. Inlining it first is the difference between a letterhead and a hole.
 */
import { useEffect, useState } from "react";
import { inlineImage } from "@/utils/idCardExport";

const LOGO_PATH = "/dts-logo-full.png";

export function useCompanyLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    inlineImage(LOGO_PATH).then((url) => { if (alive) setLogo(url); });
    return () => { alive = false; };
  }, []);

  return logo;
}
