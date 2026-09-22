export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
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
