/**
 * The longest edge an image is sent to the model at.
 *
 * ── Why images are made smaller before they are sent ─────────────────────────────────────────────
 * Members attach photographs straight from a phone: 3–10 MB each, 4000 px across. Every one was read
 * whole into base64 (a third bigger again) and uploaded to EVERY call that uses it — the extraction,
 * the location scout, the frames, the poster concepts — so a run with six photos pushed well over a
 * hundred megabytes up a mobile connection before the model had read a word. The model does not need
 * them: it reads images at a few thousand pixels at most and tiles them far smaller. 2048 px keeps the
 * small print on a visiting card legible and cuts a phone photo to a few hundred kilobytes.
 */
export const MODEL_IMAGE_EDGE = 2048;
/** An image this small or smaller is sent exactly as it is. */
const SEND_AS_IS_BYTES = 700 * 1024;
/** Formats a canvas can write back in the SAME format, so the caller's `file.type` stays true. */
const RESIZABLE = /^image\/(jpeg|png|webp)$/;

const readAsBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = (error) => reject(error);
});

/** The image redrawn at no more than MODEL_IMAGE_EDGE on its longest side, in its own format. */
async function downscaled(file: File): Promise<Blob | null> {
  if (!RESIZABLE.test(file.type) || file.size <= SEND_AS_IS_BYTES) return null;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MODEL_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.88));
    // A redraw that came out no smaller is not worth sending in place of the original.
    return blob && blob.size < file.size ? blob : null;
  } finally {
    bitmap.close?.();
  }
}

/** Each file is prepared once and reused by every call that sends it. */
const prepared = new WeakMap<File, Promise<string>>();

export const fileToBase64 = (file: File): Promise<string> => {
  const hit = prepared.get(file);
  if (hit) return hit;
  const job = downscaled(file)
    .catch(() => null) // an image the browser cannot redraw is sent as it is
    .then((small) => readAsBase64(small ?? file));
  prepared.set(file, job);
  // A failed read is not cached, so the next call tries again.
  job.catch(() => prepared.delete(file));
  return job;
};

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * The MIME type to send for an audio file, when the browser gave none.
 *
 * Android pickers and WhatsApp exports hand over voice notes with an empty `type` surprisingly
 * often, and an inline part with an empty MIME type is rejected by the model outright — which is why a
 * client's voice note was sometimes "not understood" at all. The extension says what it is.
 */
export function audioMimeTypeOf(file: File): string {
  if (file.type && file.type.startsWith('audio/')) return file.type;
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mp3';
    case 'wav': return 'audio/wav';
    case 'ogg': case 'oga': case 'opus': return 'audio/ogg';
    case 'flac': return 'audio/flac';
    case 'aac': return 'audio/aac';
    case 'm4a': case '3ga': return 'audio/mp4';
    case 'amr': return 'audio/amr';
    case 'weba': return 'audio/webm';
    default: return file.type || 'audio/mpeg';
  }
}
