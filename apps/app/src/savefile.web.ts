/**
 * Hand the user a file (web side): a Blob behind a one-shot anchor click —
 * the browser's own download path, no permission, no popup. The object URL
 * is revoked on a delay because revoking synchronously races the download
 * start in WebKit.
 */
export async function saveTextFile(name: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
