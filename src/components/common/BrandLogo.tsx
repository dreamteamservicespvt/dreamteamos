/**
 * The company logo, in the one place it is decided what "the logo" means.
 *
 * There are two things a logo has to survive here and they pull in opposite directions: the app is
 * dark by default, and it has a light theme. The brand mark is a single colour with a transparent
 * background, so one file cannot serve both — a white logo on a light sidebar is a blank space,
 * which is exactly how a missing image looks. Both files ship, and CSS picks: white on dark, black
 * on light. Nothing has to know which theme is on.
 *
 * `variant` is about size, not colour. The full lockup carries "DREAM TEAM SERVICES" and the
 * tagline under the letters, which stop being readable below about 40px tall and turn into grey
 * fuzz — so the small slots (a collapsed 64px sidebar, a phone's top bar) get the DTS letters
 * alone, cropped from the same artwork so it is the same logo and not a second one.
 *
 * `on="dark"` is for the places that are dark whatever the theme says — a black tile on the login
 * screen — where asking the theme would give the wrong answer half the time.
 */

const SOURCES = {
  full: { light: "/black_logo.png", dark: "/white_logo.png" },
  mark: { light: "/dts-mark-black.png", dark: "/dts-mark-white.png" },
} as const;

export default function BrandLogo({
  variant = "full", on = "auto", className = "", alt = "DTS — Dream Team Services",
}: {
  /** `full` is the whole lockup; `mark` is the DTS letters alone, for small slots. */
  variant?: "full" | "mark";
  /** The surface underneath. `dark` forces the white logo; `auto` follows the theme. */
  on?: "auto" | "dark";
  className?: string;
  alt?: string;
}) {
  const src = SOURCES[variant];

  if (on === "dark") {
    return <img src={src.dark} alt={alt} className={className} data-test="brand-logo" />;
  }

  return (
    <>
      <img src={src.light} alt={alt} className={`dark:hidden ${className}`} data-test="brand-logo" />
      <img src={src.dark} alt="" aria-hidden className={`hidden dark:block ${className}`} />
    </>
  );
}
