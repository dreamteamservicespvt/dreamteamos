/**
 * The company logo as a data URL, ready to be captured into a PDF.
 *
 * html2canvas will not draw an image it has to fetch at capture time, so a letterhead whose logo
 * is a plain `/dts-logo-full.png` path renders on screen and comes out as a blank gap in the
 * downloaded file. Inlining it first is the difference between a letterhead and a hole.
 *
 * An uploaded logo from Settings → Company Documents wins over the bundled one; if inlining the
 * uploaded file fails (a Cloudinary hiccup, CORS), the bundled logo is used rather than nothing —
 * a letter going out with no logo at all is the worse of the two failures.
 */
import { useEffect, useState } from "react";
import { inlineImage } from "@/utils/idCardExport";
import { useCompany } from "@/hooks/useCompany";

const BUNDLED_LOGO = "/dts-logo-full.png";

export function useCompanyLogo(): string | null {
  const { company } = useCompany();
  const [logo, setLogo] = useState<string | null>(null);
  const uploaded = company.logoUrl;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (uploaded) {
        const inlined = await inlineImage(uploaded);
        if (!alive) return;
        if (inlined) { setLogo(inlined); return; }
      }
      const fallback = await inlineImage(BUNDLED_LOGO);
      if (alive) setLogo(fallback);
    };
    load();
    return () => { alive = false; };
  }, [uploaded]);

  return logo;
}
