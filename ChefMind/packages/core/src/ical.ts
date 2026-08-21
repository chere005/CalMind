/**
 * iCalendar, read.
 *
 * Every route into someone else's calendar ends here: a subscribed .ics link
 * and a full CalDAV query both hand back VEVENTs, so this is the part worth
 * building before the argument about OAuth is settled. Nothing in this file
 * knows how the text arrived.
 *
 * The hard part is not the format, it is time. A calendar carries three
 * different kinds of moment — a date with no time, an instant in UTC, and a
 * wall clock in some named zone — and they are not interchangeable. Getting
 * that wrong shows up as an event an hour out twice a year, which is the
 * bug nobody reports and everybody stops trusting the app over.
 */

export type IcalEvent = {
  uid: string;
  summary: string;
  location: string;
  /** Wall-clock date in the caller's zone, YYYY-MM-DD. */
  start: string;
  /** 24h HH:MM in the caller's zone, or null for an all-day event. */
  time: string | null;
  end: string | null;
  endTime: string | null;
  allDay: boolean;
  rrule: string | null;
  exdates: string[];
};

/**
 * Long lines are split with CRLF + one space or tab. The continuation byte is
 * part of the fold, not the value — dropping the wrong one silently eats a
 * character out of the middle of a summary.
 */
export function unfoldIcal(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

export type IcalProp = { name: string; params: Record<string, string>; value: string };

export function parseIcalLine(line: string): IcalProp | null {
  // The colon that ends the name+params is the first one NOT inside quotes:
  // a TZID may legally be quoted and contain anything.
  let colon = -1;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') quoted = !quoted;
    else if (c === ':' && !quoted) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let buf = '';
  quoted = false;
  for (const c of head) {
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ';' && !quoted) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: parts[0]!.toUpperCase(), params, value };
}

/** TEXT values escape their separators; the backslash pairs must come apart. */
export function unescapeIcalText(v: string): string {
  let out = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== '\\') { out += v[i]; continue; }
    const n = v[++i];
    out += n === 'n' || n === 'N' ? '\n' : n === undefined ? '\\' : n;
  }
  return out;
}

// ---------------------------------------------------------------- zones

const PARTS_CACHE = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = PARTS_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    PARTS_CACHE.set(tz, f);
  }
  return f;
}

/** The wall clock in `tz` at a given instant. */
export function utcToZoned(ms: number, tz: string): { ymd: string; hm: string } {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  // Midnight comes back as hour 24 in some engines; it is the same day's start.
  const hour = p.hour === '24' ? '00' : p.hour!;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${hour}:${p.minute}` };
}

/**
 * The instant at which `tz` reads this wall clock. Found by probing rather
 * than by carrying a zone table: guess UTC, see what the guess reads as in
 * the zone, and correct by the difference. Twice, because the correction can
 * itself cross a DST boundary.
 *
 * The ambiguous hour when clocks go back genuinely has two answers; this
 * settles on the first, which is what calendar servers do.
 */
export function zonedToUtc(ymd: string, hm: string, tz: string): number {
  const [y, mo, d] = ymd.split('-').map(Number) as [number, number, number];
  const [h, mi] = hm.split(':').map(Number) as [number, number];
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const back = utcToZoned(guess, tz);
    const [gy, gmo, gd] = back.ymd.split('-').map(Number) as [number, number, number];
    const [gh, gmi] = back.hm.split(':').map(Number) as [number, number];
    const got = Date.UTC(gy, gmo - 1, gd, gh, gmi);
    if (got === wanted) break;
    guess += wanted - got;
  }
  return guess;
}

// ---------------------------------------------------------------- events

function splitDateTime(p: IcalProp, tz: string): { ymd: string; hm: string | null } {
  const v = p.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || (p.params['VALUE'] ?? '').toUpperCase() === 'DATE') {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v)!;
    return { ymd: `${m[1]}-${m[2]}-${m[3]}`, hm: null };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!dt) return { ymd: '', hm: null };
  const wallYmd = `${dt[1]}-${dt[2]}-${dt[3]}`;
  const wallHm = `${dt[4]}:${dt[5]}`;
  if (dt[7] === 'Z') {
    return zonedify(Date.UTC(+dt[1]!, +dt[2]! - 1, +dt[3]!, +dt[4]!, +dt[5]!), tz);
  }
  const tzid = p.params['TZID'];
  if (tzid && tzid !== tz) {
    try {
      return zonedify(zonedToUtc(wallYmd, wallHm, tzid), tz);
    } catch {
      // An unknown zone id is not worth losing the event over; the wall clock
      // as written is closer to right than nothing.
      return { ymd: wallYmd, hm: wallHm };
    }
  }
  // No TZID and no Z is a "floating" time: it means the same clock reading
  // wherever you are, so it is already what we want.
  return { ymd: wallYmd, hm: wallHm };
}

function zonedify(ms: number, tz: string): { ymd: string; hm: string | null } {
  const z = utcToZoned(ms, tz);
  return { ymd: z.ymd, hm: z.hm };
}

export function parseIcal(text: string, tz = 'America/Chicago'): IcalEvent[] {
  const out: IcalEvent[] = [];
  let cur: Partial<IcalEvent> & { exdates?: string[] } | null = null;
  for (const line of unfoldIcal(text)) {
    const p = parseIcalLine(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && p.value.toUpperCase() === 'VEVENT') {
      cur = { exdates: [] };
      continue;
    }
    if (p.name === 'END' && p.value.toUpperCase() === 'VEVENT') {
      if (cur && cur.start) {
        out.push({
          uid: cur.uid ?? '',
          summary: cur.summary ?? '(no title)',
          location: cur.location ?? '',
          start: cur.start,
          time: cur.time ?? null,
          end: cur.end ?? null,
          endTime: cur.endTime ?? null,
          allDay: cur.time == null,
          rrule: cur.rrule ?? null,
          exdates: cur.exdates ?? [],
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = unescapeIcalText(p.value); break;
      case 'LOCATION': cur.location = unescapeIcalText(p.value); break;
      case 'RRULE': cur.rrule = p.value; break;
      case 'DTSTART': {
        const s = splitDateTime(p, tz);
        cur.start = s.ymd;
        cur.time = s.hm;
        break;
      }
      case 'DTEND': {
        const e = splitDateTime(p, tz);
        cur.end = e.ymd;
        cur.endTime = e.hm;
        break;
      }
      case 'EXDATE': {
        for (const one of p.value.split(',')) {
          const d = splitDateTime({ ...p, value: one }, tz);
          if (d.ymd) cur.exdates!.push(d.ymd);
        }
        break;
      }
      default: break;
    }
  }
  return out;
}
