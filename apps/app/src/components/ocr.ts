/**
 * OCR for the recipe importer. Web runs tesseract.js (assets fetched on
 * first use, cached after); native returns a clear not-yet message — the
 * on-device ML Kit path is a later milestone, and callers surface the
 * message rather than failing silently.
 */
import { Platform } from 'react-native';

export async function ocrImages(
  uris: string[],
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  if (Platform.OS !== 'web') {
    throw new Error('Photo text reading is web-only for now.');
  }
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  const pages: string[] = [];
  try {
    for (let i = 0; i < uris.length; i++) {
      const { data } = await worker.recognize(uris[i]!);
      pages.push(data.text ?? '');
      onProgress(i + 1, uris.length);
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}
