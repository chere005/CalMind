/**
 * OCR for the recipe importer. Web runs tesseract.js (assets fetched on
 * first use, cached after); native returns a clear not-yet message — the
 * on-device ML Kit path is a later milestone, and callers surface the
 * message rather than failing silently.
 */
import { Platform } from 'react-native';

/**
 * Whether this platform can read a photo at all. Asked BEFORE the picker
 * opens: the check used to live inside ocrImages, so a phone offered the
 * library, took your selection, and only then said it could not read any of
 * it. Doing the work first and refusing afterwards is the wrong order.
 */
export function ocrSupported(): boolean {
  return Platform.OS === 'web';
}

export const OCR_UNSUPPORTED = 'Reading photos is web-only for now — open CalMind in a browser to import a card.';

export async function ocrImages(
  uris: string[],
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  if (!ocrSupported()) {
    throw new Error(OCR_UNSUPPORTED);
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
