/**
 * OCR for the recipe importer.
 *
 * Web runs tesseract.js — a WASM engine plus a language pack fetched on first
 * use. iOS runs Apple's VISION framework through the native-ocr module:
 * already on the device, no download, on the neural engine, and markedly
 * better at what this app actually does — a photograph of a printed card,
 * taken at an angle, in a kitchen.
 *
 * Android has no path yet and says so. The message names the platform rather
 * than claiming 'not supported', because 'open it in a browser' is a real
 * answer there and a dead end is not.
 */
import { Platform } from 'react-native';

/** The Vision-backed module, iOS only; null everywhere else. */
type OcrBridge = { recognize: (uri: string) => Promise<string> };
let native: OcrBridge | null = null;
if (Platform.OS === 'ios') {
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    native = requireOptionalNativeModule?.('NativeOcr') ?? null;
  } catch {
    // An older build without the module must still run — it just cannot read
    // photos, which ocrSupported() then reports honestly.
    native = null;
  }
}

/**
 * Whether this platform can read a photo at all. Asked BEFORE the picker
 * opens: the check used to live inside ocrImages, so a phone offered the
 * library, took your selection, and only then said it could not read any of
 * it. Doing the work first and refusing afterwards is the wrong order.
 */
export function ocrSupported(): boolean {
  return Platform.OS === 'web' || native !== null;
}

export const OCR_UNSUPPORTED = 'Reading photos needs iOS or a browser — open CalMind there to import a card.';

export async function ocrImages(
  uris: string[],
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  if (!ocrSupported()) {
    throw new Error(OCR_UNSUPPORTED);
  }
  if (native) {
    const pages: string[] = [];
    for (let i = 0; i < uris.length; i++) {
      // One at a time, reporting as it goes: a card is usually one or two
      // photos, and a progress line that moves beats a faster silence.
      pages.push(await native.recognize(uris[i]!));
      onProgress(i + 1, uris.length);
    }
    return pages;
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
