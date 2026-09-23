/**
 * The AdGen brand treatment — violet through blue to cyan.
 *
 * One definition, read by every AI-platform component. It used to be declared separately in each
 * file that needed it, which is how two copies of a gradient quietly stop matching.
 */
export const BRAND_GRADIENT = 'bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500';
export const BRAND_GRADIENT_HOVER = 'hover:from-violet-500 hover:via-blue-500 hover:to-cyan-400';
export const BRAND_TEXT = 'bg-clip-text text-transparent bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400';

/**
 * The studio (AdGen.ai) is a dark room whatever the rest of the app is set to: adgen.css paints its
 * own canvas, so a light-theme member would otherwise get white cards floating on it. Components
 * still take/keep an `isDark` flag — they are read by tests and by the shared AttachmentBanner — so
 * this is the one place that decides it.
 */
export const STUDIO_IS_DARK = true;
