/** Connection and display rules shared by the calendar import form/cache.
 *  All providers end in the same read-only ICS renderer. */
import { parseIcalLine, unescapeIcalText, unfoldIcal } from './ical';
import type { CalSub, CalSubSource } from './types';

function googleFeed(url: URL): boolean {
  return (url.hostname === 'calendar.google.com' || url.hostname === 'www.google.com') &&
    url.protocol === 'https:' && url.port === '' && /^\/calendar\/ical\/.+\.ics$/i.test(url.pathname);
}

/** Null means the form should ask for a different link. Credentials belong in
 *  separate fields; fragments never identify a resource sent to the server. */
export function normalizeSubUrl(input: string, source: CalSubSource = 'ical'): string | null {
  const text = input.trim();
  if (!/^(?:https?|webcal):\/\//i.test(text) || /[\s\\\u0000-\u001f\u007f]/.test(text)) return null;
  try {
    const url = new URL(text.replace(/^webcal:/i, 'https:'));
    const authority = text.slice(text.indexOf('//') + 2).split(/[/?#]/, 1)[0]!;
    if (!url.hostname || authority.includes('@') || url.username || url.password || url.hash || text.includes('#')) return null;
    if (source === 'caldav' && url.protocol !== 'https:') return null;
    if (source === 'google' && !googleFeed(url)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function subSourceLabel(sub: Pick<CalSub, 'url' | 'source'>): 'CalDAV' | 'Google' | 'link' {
  if (sub.source === 'caldav') return 'CalDAV';
  if (sub.source === 'google') return 'Google';
  try {
    if (googleFeed(new URL(sub.url.replace(/^webcal:/i, 'https:')))) return 'Google';
  } catch { /* malformed old links retain the generic label */ }
  return 'link';
}

/** A feed added through either link form is the same subscription. CalDAV
 *  users can have different calendars at the same URL, so include the user.
 *  Passwords deliberately do not form part of this display identity. */
export function subIdentity(sub: Pick<CalSub, 'url' | 'source' | 'username'>): string {
  return JSON.stringify([
    normalizeSubUrl(sub.url) ?? sub.url.trim(),
    sub.source === 'caldav' ? (sub.username ?? '').trim() : '',
  ]);
}

/** X-WR-CALNAME belongs to VCALENDAR, not one of its child components. */
export function subCalendarName(ics: string, fallback: string): string {
  let inCalendar = false;
  for (const line of unfoldIcal(ics.replace(/^\ufeff/, ''))) {
    const prop = parseIcalLine(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      if (prop.value.toUpperCase() !== 'VCALENDAR' || inCalendar) break;
      inCalendar = true;
    } else if (inCalendar && prop.name === 'X-WR-CALNAME') {
      const name = unescapeIcalText(prop.value).replace(/\s+/g, ' ').trim();
      if (name) return name.slice(0, 200);
    } else if (prop.name === 'END') {
      break;
    }
  }
  return fallback;
}

/** Empty calendars are valid; an HTML error page or truncated response is not.
 *  Check component boundaries without requiring any particular event fields. */
export function hasCalendarFeed(ics: string): boolean {
  const lines = unfoldIcal(ics.trim());
  if (lines[0]?.toUpperCase() !== 'BEGIN:VCALENDAR' || lines[lines.length - 1]?.toUpperCase() !== 'END:VCALENDAR') return false;
  const stack: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const prop = parseIcalLine(lines[i]!);
    if (!prop || (prop.name !== 'BEGIN' && prop.name !== 'END')) continue;
    const component = prop.value.toUpperCase();
    if (prop.name === 'BEGIN') {
      if (component === 'VCALENDAR' && i !== 0) return false;
      stack.push(component);
    } else {
      if (stack.pop() !== component || (stack.length === 0 && i !== lines.length - 1)) return false;
    }
  }
  return stack.length === 0;
}
