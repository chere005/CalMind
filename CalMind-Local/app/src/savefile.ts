/**
 * Hand the user a file (native side): write it to the cache directory and
 * open the share sheet — Files, AirDrop, Mail, wherever they point it. The
 * cache copy is disposable by design; the share target holds the real one.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveTextFile(name: string, text: string): Promise<void> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete(); // a second export the same day rewrites, not fails
  f.write(text);
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: name });
}
