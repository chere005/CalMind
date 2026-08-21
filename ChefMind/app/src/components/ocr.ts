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

export const OCR_UNSUPPORTED = 'Reading photos needs iOS or a browser — open ChefMind there to import a card.';

export async function ocrImages(
  uris: string[],
  onProgress: (done: number, total: number) => void,
): Promise<string[]> {
  if (!ocrSupported()) {
    throw new Error(OCR_UNSUPPORTED);
  }
  if (native) {
    const pages: string[] = [];
    let failed = 0;
    for (let i = 0; i < uris.length; i++) {
      // One at a time, reporting as it goes: a card is usually one or two
      // photos, and a progress line that moves beats a faster silence.
      //
      // Per-photo, because an unguarded await threw the WHOLE import away on
      // one bad frame — photograph both sides of a card, have the second fail,
      // and the first is discarded too. Keeping what was read is the point;
      // the count of what was not is reported rather than swallowed.
      try {
        pages.push(await native.recognize(uris[i]!));
      } catch {
        failed++;
      }
      onProgress(i + 1, uris.length);
    }
    // Everything failed: that IS the error, and the caller should say so.
    if (pages.length === 0) {
      throw new Error(uris.length === 1 ? 'That photo could not be read.' : 'None of those photos could be read.');
    }
    if (failed > 0) {
      throw Object.assign(new Error(`${failed} of ${uris.length} photos could not be read.`), { pages });
    }
    return pages;
  }
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  const pages: string[] = [];
  let failed = 0;
  try {
    for (let i = 0; i < uris.length; i++) {
      // Guarded per photo for the same reason the native path is: one frame
      // failing used to throw out every page already read. The `finally`
      // below only ever tidied the worker — it never protected the work.
      // This is the path Sean actually imports through today.
      try {
        const { data } = await worker.recognize(uris[i]!);
        pages.push(data.text ?? '');
      } catch {
        failed++;
      }
      onProgress(i + 1, uris.length);
    }
  } finally {
    await worker.terminate();
  }
  if (pages.length === 0) {
    throw new Error(uris.length === 1 ? 'That photo could not be read.' : 'None of those photos could be read.');
  }
  if (failed > 0) {
    throw Object.assign(new Error(`${failed} of ${uris.length} photos could not be read.`), { pages });
  }
  return pages;
}
