/**
 * The one request this app makes to the outside world.
 *
 * Sean, 2026-08-21: "can you still add the url parsing of recipes? reading
 * from that url is fine, the rest of the app remains local to its data or
 * paired devices." So: a GET of a page he pasted, its HTML handed to
 * `recipeFromHtml`, and nothing else — no telemetry, no token, no server, and
 * the store never leaves the device.
 *
 * Upstream this was `apiPost({action:'recipe_fetch'})` and the fetching
 * happened on the server behind server/lib/fetchurl.php. Here the device
 * fetches, so the guards that lived in PHP have to live somewhere: WHICH
 * addresses is `checkFetchUrl` in core, tested; the caps below are the rest of
 * that file's care, in the terms a phone has.
 */
import { checkFetchUrl } from '@calmind/core';

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A recipe site sends the same page to everything, but plenty of them refuse
 * a client that does not look like a browser — allrecipes turned the server
 * away outright, which is written down in the PHP this replaces. Sending
 * Safari's string is what makes the feature work at all on the sites people
 * actually paste, and this is a person reading a page they chose, from their
 * own phone, which is what that string describes.
 */
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** The page's HTML, or an Error whose message is a sentence to show. */
export async function fetchRecipeHtml(input: string): Promise<string> {
  const checked = checkFetchUrl(input);
  if (!checked.ok) throw new Error(checked.why);

  const ctl = new AbortController();
  // A site that accepts the connection and never answers must not leave the
  // importer spinning forever — the PHP had CURLOPT_TIMEOUT for the same
  // reason, and a phone on a train needs it more than a datacentre did.
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(checked.url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': UA,
      },
      signal: ctl.signal,
    });
  } catch (err) {
    if (ctl.signal.aborted) throw new Error(`that page took too long to answer (over ${TIMEOUT_MS / 1000}s)`);
    // iOS refuses plain http by default (App Transport Security) and reports
    // it as an ordinary network failure, which reads as "the site is down"
    // when the site is fine. Say the thing that fixes it.
    if (checked.url.startsWith('http://')) throw new Error('that link is plain http, which iOS blocks — try the https version');
    // NAME THE HOST. 'could not reach that page' hid a typo that was plainly
    // visible once the host was printed — a link truncated to
    // 'www.bonappetit.c' failed to resolve and read as the site being down.
    throw new Error(`could not reach ${checked.host}`);
  } finally {
    clearTimeout(timer);
  }

  /**
   * WHERE IT ENDED UP, not where it was sent. React Native follows redirects
   * itself and offers no way to intercept a hop, so the address check cannot
   * run per-hop the way the PHP's hand-rolled loop did. `res.url` is the final
   * URL, and re-checking it catches the redirect-into-the-LAN case AFTER the
   * request rather than before — the response is dropped unread, so nothing
   * that came back from a private address is ever parsed or shown. A device
   * on the same LAN as the target is the reason to bother at all.
   */
  if (res.url) {
    const final = checkFetchUrl(res.url);
    if (!final.ok) throw new Error(`that link redirects somewhere CalMind Local will not follow — ${final.why}`);
  }

  if (!res.ok) {
    // 402 belongs with 401/403 rather than in the fallback: Dotdash's edge
    // (allrecipes, seriouseats) answers 402 to anything it reads as a bot,
    // and 'that site answered 402' sends a person looking for a paywall that
    // is not there. Measured 2026-08-21 — those two refused this machine and
    // bonappetit came back with the whole recipe.
    throw new Error(
      res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429
        ? `that site refused the request (${res.status}) — some block anything that is not a browser`
      : res.status === 404 ? 'there is nothing at that address (404)'
      : res.status >= 500 ? `that site is having trouble (${res.status})`
      : `that site answered ${res.status}`,
    );
  }

  // The size cap is advisory rather than enforced: RN's fetch has no readable
  // stream, so by the time this can measure anything the body is already in
  // memory. Content-Length is the only chance to refuse BEFORE that, and a
  // chunked response does not send one — hence the second check after.
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new Error(`that page is too large to read (over ${MAX_BYTES / 1024 / 1024}MB)`);

  const html = await res.text();
  if (html.length > MAX_BYTES) throw new Error(`that page is too large to read (over ${MAX_BYTES / 1024 / 1024}MB)`);
  // A PDF or an image has no JSON-LD in it; the PHP made the same sniff and
  // for the same reason — say "that is not a web page" rather than "no recipe
  // found", which sends whoever pasted it looking for the wrong problem.
  if (!/<html|<script/i.test(html)) throw new Error('that page does not look like a web page');
  return html;
}
