/**
 * Which URLs this app will fetch — the one place CalMind-Local reaches outside
 * itself.
 *
 * The whole app is local: its data lives on the device and moves only to
 * paired devices over Bonjour. A recipe link is the single exception Sean
 * asked for (2026-08-21), and it is a read of a page he pasted himself.
 *
 * The parent app had the SERVER fetch, behind server/lib/fetchurl.php, because
 * a browser cannot (recipe sites send no CORS headers) and because a request
 * made from inside the host can reach addresses the user cannot — SSRF. There
 * is no server here, so the phone fetches, and the shape of the risk changes
 * rather than going away:
 *
 *  · The phone sits ON Sean's LAN, beside the very peers this app pairs with.
 *    A pasted link to http://192.168.1.10/… would be fetched from inside the
 *    network, by an app that is otherwise not allowed to talk to anything.
 *  · `.local` is Bonjour's own suffix. The app advertises there. A page that
 *    can steer a fetch at it is poking the pairing surface.
 *
 * So: http(s) only, and never an address on this device or this network. The
 * rule lives here, in core, because it is a rule with edge cases — decimal and
 * octal IPv4 spellings, IPv4-mapped IPv6, a userinfo '@' hiding the real host —
 * and every one of those is a line in fetchguard.test.ts. The app layer owns
 * the fetch; this owns the decision.
 *
 * What it deliberately does NOT do is resolve the name. There is no DNS in JS,
 * so a public name pointing at 192.168.1.10 gets through — the rebinding case
 * the PHP guard closed by resolving every hop itself. On a device the trade is
 * different from the server's: the attacker would need Sean to paste their
 * link, and what they'd reach is the network he is already on rather than a
 * host holding everyone's data. Worth saying out loud rather than implying the
 * literal check is the whole of it.
 */

export type UrlCheck = { ok: true; url: string; host: string } | { ok: false; why: string };

/**
 * The pasted link, normalized, or the sentence to show instead.
 *
 * A bare host is taken as https — pasting 'seriouseats.com/…' from a share
 * sheet is ordinary, and refusing it teaches nothing.
 */
export function checkFetchUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (raw === '') return { ok: false, why: 'no link' };
  // Only prepend when there is no scheme AT ALL. 'file:/x' must reach the
  // scheme check below and be refused for the reason that is true, rather
  // than becoming 'https://file:/x' and reading as a malformed URL.
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw;

  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(url);
  if (!m) return { ok: false, why: 'that does not look like a link' };
  const scheme = m[1]!.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, why: 'only http and https links' };

  const host = hostOf(m[2]!);
  if (host === '') return { ok: false, why: 'that does not look like a link' };
  // NAME THE HOST. Without it this message hid a typo on the simulator
  // (2026-08-21): a dropped keystroke left the link starting mid-word, the
  // host came out as one label, and 'that address is on this network' read as
  // the guard being broken rather than the link being wrong.
  if (!isPublicHost(host)) return { ok: false, why: `${host} is this device or this network — CalMind Local will not fetch it` };
  return { ok: true, url, host };
}

/**
 * The host out of an authority, with the tricks undone.
 *
 * Userinfo is the one that matters: 'https://www.seriouseats.com@192.168.1.10/'
 * is a request to 192.168.1.10 that reads to a person as a recipe site. Split
 * on the LAST '@' — a password may contain one.
 */
export function hostOf(authority: string): string {
  const at = authority.lastIndexOf('@');
  let hostport = at >= 0 ? authority.slice(at + 1) : authority;
  if (hostport.startsWith('[')) {
    const end = hostport.indexOf(']');
    if (end < 0) return '';
    return normalizeHost(hostport.slice(1, end));
  }
  const colon = hostport.indexOf(':');
  if (colon >= 0) hostport = hostport.slice(0, colon);
  return normalizeHost(hostport);
}

/** Percent-decoded, lowercased, and without the root's trailing dot. */
function normalizeHost(h: string): string {
  let out = h;
  try {
    out = decodeURIComponent(out);
  } catch {
    // A lone '%' is not an escape; take the host as written rather than
    // losing the check to an exception.
  }
  out = out.toLowerCase();
  while (out.endsWith('.')) out = out.slice(0, -1);
  return out;
}

/** Names that mean this device or this network however they resolve. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'home.arpa', 'lan', 'intranet', 'private'];

export function isPublicHost(host: string): boolean {
  if (host === '') return false;

  const v6 = parseIpv6(host);
  if (v6) return isPublicIpv6(v6);
  const v4 = parseIpv4(host);
  if (v4 !== null) return isPublicIpv4(v4);
  // Something that looks like an address but parsed as neither is not a name
  // either — refuse rather than let a spelling nobody modelled through.
  if (/^[0-9.]+$/.test(host) || host.includes(':')) return false;

  const labels = host.split('.');
  if (labels.some((l) => l === '')) return false;
  const last = labels[labels.length - 1]!;
  const lastTwo = labels.slice(-2).join('.');
  if (LOCAL_SUFFIXES.includes(last) || LOCAL_SUFFIXES.includes(lastTwo)) return false;
  // A single label is a machine on this network ('nas', 'router'), never a
  // site: a public name always has a dot in it.
  return labels.length >= 2;
}

/**
 * An IPv4 address as a 32-bit number, in every spelling the C resolver takes:
 * '127.0.0.1', '0177.0.0.1' (octal), '0x7f.0.0.1' (hex), '2130706433' (one
 * number), '127.1' (parts, last one wide). All of these reach loopback, and
 * a guard that only knows the dotted-decimal one is a guard with a door in it.
 */
export function parseIpv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parsePart(p);
    if (n === null) return null;
    nums.push(n);
  }
  // The last part carries every byte the earlier parts did not name.
  const wide = nums[nums.length - 1]!;
  const lead = nums.slice(0, -1);
  if (lead.some((n) => n > 255)) return null;
  const room = 256 ** (4 - lead.length);
  if (wide >= room) return null;
  let out = 0;
  for (const n of lead) out = out * 256 + n;
  return out * room + wide;
}

function parsePart(p: string): number | null {
  if (p === '') return null;
  let n: number;
  if (/^0[xX][0-9a-fA-F]+$/.test(p)) n = parseInt(p.slice(2), 16);
  else if (/^0[0-7]+$/.test(p)) n = parseInt(p.slice(1), 8);
  else if (/^[0-9]+$/.test(p)) n = parseInt(p, 10);
  else return null;
  return Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff ? n : null;
}

/** The ranges that are this device, this network, or reserved. */
export function isPublicIpv4(n: number): boolean {
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  if (a === 0) return false;                          // 0.0.0.0/8, 'this network'
  if (a === 10 || a === 127) return false;            // private, loopback
  if (a === 169 && b === 254) return false;           // link-local AND 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return false;  // private
  if (a === 192 && b === 168) return false;           // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier NAT
  if (a === 192 && b === 0) return false;             // 192.0.0/24 protocol, 192.0.2 doc
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;                         // multicast and reserved, 255.255.255.255 with them
  return true;
}

/** Enough IPv6 to decide: the groups, or null when this is not one. */
export function parseIpv6(host: string): number[] | null {
  if (!host.includes(':')) return null;
  // An IPv4-mapped tail ('::ffff:192.168.1.10') is a v4 address wearing a v6
  // coat, and reaches exactly where the v4 does.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  let text = host;
  if (tail) {
    const v4 = parseIpv4(tail[1]!);
    if (v4 === null) return null;
    text = host.slice(0, tail.index) + hex4((v4 >>> 16) & 0xffff) + ':' + hex4(v4 & 0xffff);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string): number[] | null => {
    if (s === '') return [];
    const out: number[] = [];
    for (const g of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : null;
  if (head === null || (halves.length === 2 && rest === null)) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - rest!.length;
  if (fill < 1) return null;
  return [...head, ...Array(fill).fill(0), ...rest!];
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0');
}

export function isPublicIpv6(g: number[]): boolean {
  const zeros = g.slice(0, 7).every((x) => x === 0);
  if (zeros && (g[7] === 1 || g[7] === 0)) return false;     // ::1 and ::
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPublicIpv4(((g[6]! << 16) >>> 0) + g[7]!);      // ::ffff:a.b.c.d
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return false;             // fc00::/7 unique local
  if ((g[0]! & 0xffc0) === 0xfe80) return false;             // fe80::/10 link-local
  return true;
}
