/**
 * Deciding whether to pick up a newer build.
 *
 * An installed iOS home-screen web app does not reliably re-fetch its page.
 * Measured, not assumed: a read-out was deployed, confirmed present in the
 * SERVED bundle, and still did not appear in the installed app across several
 * relaunches — while index.html is sent `no-cache` and the bundle is
 * content-hashed and `immutable`, so a genuine cold load could not have
 * missed it. The app simply keeps the page it has. Every fix shipped is
 * therefore invisible on the one device that matters until the icon is
 * removed and re-added by hand.
 *
 * The check itself is trivial — compare the bundle the page is RUNNING with
 * the one the server currently advertises — and the whole difficulty is in
 * when it is safe to act. Reloading under someone's hands loses what they
 * were typing, so:
 *
 *  · nothing unsent. `dirty` is the sync engine's own count; if anything is
 *    still owed to the server, a reload could drop it, and waiting costs
 *    nothing because the next visit will ask again.
 *  · once per session, AND never twice towards the same build. The first is
 *    not enough on its own: a reload re-evaluates this module, so an
 *    in-memory flag resets exactly when it is needed. If the page comes back
 *    still running the old bundle — which is the very failure this exists to
 *    work around — it would ask again, decide again, and reload for ever. So
 *    the build we reloaded TOWARDS is remembered across the reload, and
 *    seeing it again means the attempt did not take and must not be repeated.
 *    Caught by a spec that watched the page navigate four times in three
 *    seconds, not by thinking about it.
 *  · nothing half-typed. `dirty` covers a note body, which reaches the engine
 *    on every keystroke, but NOT a field whose text has not been committed
 *    yet — a new reminder, a folder name, a recipe line. Those live in the
 *    screen and would go with the page. The caller reports whether any field
 *    is holding text; if one is, this waits.
 *  · both names known. A failed fetch reads as null, which means "no idea",
 *    and no idea is never a reason to throw the page away.
 */
export type UpdateCheck = {
  /** The bundle filename this page is running, or null if it cannot be told. */
  running: string | null;
  /** The bundle filename the server advertises now, or null if the check failed. */
  latest: string | null;
  /** Records still owed to the server. */
  dirty: number;
  /** Whether any field on screen is holding text that is not committed yet. */
  typing: boolean;
  /** Whether this page's life has already reloaded for an update. */
  reloadedThisSession: boolean;
  /** The build a previous reload aimed at, remembered ACROSS that reload. */
  triedTarget: string | null;
};

export function shouldReload(c: UpdateCheck): boolean {
  if (c.running === null || c.latest === null) return false; // no idea is not a reason
  if (c.running === c.latest) return false;
  if (c.dirty > 0) return false;                             // never over unsent work
  if (c.typing) return false;                                // nor over a half-typed field
  if (c.reloadedThisSession) return false;                   // not twice in one page life
  if (c.latest === c.triedTarget) return false;              // and never twice at the same build
  return true;
}

/**
 * The bundle filename out of a page's HTML.
 *
 * Deliberately the same shape for the page we are running and the page the
 * server just sent, so the two are compared like with like. Expo's export
 * emits exactly one entry script under that path; an async chunk lives beside
 * it with a different name, which is why this matches the FIRST occurrence in
 * document order rather than any occurrence — a lesson already paid for once,
 * when a `head -1` over a directory listing picked the wrong one of the two
 * and made a deploy look broken that was not.
 */
export function bundleNameFrom(html: string): string | null {
  const m = /_expo\/static\/js\/web\/(index-[a-z0-9]+\.js)/i.exec(html);
  return m ? m[1]! : null;
}
