/**
 * Picking up a newer build, on the web.
 *
 * The decision lives in core (`shouldReload`); this is the plumbing that
 * feeds it and acts on it. Web only — the native apps update through the
 * store and have no page to replace.
 *
 * WHEN it asks is the whole point. An installed home-screen app is not
 * reloaded when you return to it; it is resumed, holding whatever page it had
 * when you left. So the question is asked exactly then — on becoming visible
 * again — which is the moment a stale app has always been stale and nobody
 * noticed.
 *
 * HOW it reloads matters too. `location.reload()` is free to reuse the very
 * cache that caused this, so the new URL carries the build it is going to, as
 * a query. A different URL is a fresh navigation, and the parameter is inert.
 */
import { Platform } from 'react-native';
import { bundleNameFrom, shouldReload } from '@calmind/core';

let reloadedThisSession = false;

/**
 * The build a previous reload aimed at, kept across that reload.
 *
 * localStorage rather than a variable, and that is the whole point: the
 * reload re-runs this module, so anything in memory is gone exactly when it
 * is needed. If the page comes back still running the old bundle — the very
 * failure this works around — an in-memory flag would let it decide again,
 * and again, for ever.
 */
const TRIED = 'calmind.updateTried';
const triedTarget = (): string | null => {
  try { return window.localStorage.getItem(TRIED); } catch { return null; }
};
const rememberTried = (v: string | null): void => {
  try { if (v === null) window.localStorage.removeItem(TRIED); else window.localStorage.setItem(TRIED, v); } catch { /* private mode */ }
};

/**
 * Is anything on screen holding text that has not been committed?
 *
 * Both halves matter. A focused editable is the obvious case; the second
 * sweep is the one that actually bites, because backgrounding an app takes
 * focus away while leaving the words sitting in the field, and returning is
 * precisely when this check runs.
 */
function someoneIsTyping(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return true;
  for (const el of Array.from(document.querySelectorAll('input, textarea'))) {
    if ((el as HTMLInputElement).value?.trim() !== '') return true;
  }
  return false;
}

/** The bundle this page is actually running, read off its own script tag. */
export function runningBundle(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLScriptElement>('script[src*="/_expo/static/js/web/index-"]');
  return el ? bundleNameFrom(el.src) : null;
}

/** What the server is serving right now, asked in a way no cache can answer. */
async function latestBundle(): Promise<string | null> {
  try {
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('_', String(Date.now()));
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    return bundleNameFrom(await res.text());
  } catch {
    return null; // offline, or the host is having a moment: not evidence
  }
}

/**
 * Watch for a newer build and take it when it is safe.
 * `pending` reports how many records are still owed to the server.
 * Returns an unsubscribe, or a no-op off the web.
 */
export function watchForUpdate(pending: () => number): () => void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return () => {};

  const check = async () => {
    if (document.visibilityState !== 'visible') return;
    const latest = await latestBundle();
    const running = runningBundle();
    // Arrived: the attempt took, so free the slot for whatever comes next.
    if (latest !== null && running === latest) rememberTried(null);
    const decided = shouldReload({
      running,
      latest,
      dirty: pending(),
      typing: someoneIsTyping(),
      reloadedThisSession,
      triedTarget: triedTarget(),
    });
    if (!decided || latest === null) return;
    reloadedThisSession = true;
    rememberTried(latest);
    const next = new URL(window.location.href);
    next.searchParams.set('b', latest.replace(/^index-|\.js$/g, '').slice(0, 8));
    window.location.replace(next.toString());
  };

  const onVisible = () => { void check(); };
  document.addEventListener('visibilitychange', onVisible);
  void check(); // and once on open, for the launch that was already stale
  return () => document.removeEventListener('visibilitychange', onVisible);
}
