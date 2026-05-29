export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data URL prefix (e.g., "data:image/png;base64,")
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

// Normalize images for generative APIs: ensure supported mime-type, reasonable size, and acceptable base64.
export const normalizeImageForGenAPI = async (file: File, maxDimension = 2048, quality = 0.85): Promise<{ mimeType: string; base64: string }> => {
  // If the file isn't an image, fall back to plain base64
  if (!file || !file.type || !file.type.startsWith('image/')) {
    const base = await fileToBase64(file);
    return { mimeType: file.type || 'application/octet-stream', base64: base };
  }

  // Try to convert/resize using canvas; this handles HEIC/HEIF/webp inconsistencies by producing a jpeg
  try {
    // Load image
    const imgBitmap = await createImageBitmap(file as any);
    const width = imgBitmap.width;
    const height = imgBitmap.height;

    let targetW = width;
    let targetH = height;

    if (Math.max(width, height) > maxDimension) {
      const ratio = maxDimension / Math.max(width, height);
      targetW = Math.round(width * ratio);
      targetH = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');

    ctx.drawImage(imgBitmap, 0, 0, targetW, targetH);

    // Export as JPEG to maximize compatibility
    const dataUrl: string = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1];
    return { mimeType: 'image/jpeg', base64 };
  } catch (err) {
    // Fallback: read raw base64 and trust original mime type
    try {
      const base = await fileToBase64(file);
      const mime = file.type && file.type.length > 0 ? file.type : 'image/jpeg';
      return { mimeType: mime, base64: base };
    } catch (e) {
      throw new Error('Failed to normalize image for Generative API: ' + String(e));
    }
  }
};
