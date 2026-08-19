/**
 * The subscribed calendars' ICS, kept fresh — the client half of Sean's
 * "subscribe-by-link first, i just want read only access to other calendar
 * system" (2026-08-18).
 *
 * The calsub RECORD (url, name, colour) syncs like everything else; the ICS
 * text does not — it is fetched through the server's calsub_fetch (a browser
 * cannot: calendar hosts do not answer CORS, and the server carries the SSRF
 * guard) and cached per subscription in AsyncStorage, OUTSIDE the snapshot.
 * Outside deliberately: an ICS can be hundreds of KB, and the snapshot is one
 * JSON string re-written on every mutate — the blob design pass (docs/) says
 * why that budget is sacred.
 *
 * Refresh on foreground and every twenty minutes; the server's own 15-minute
 * cache makes the true upstream rate lower across all devices. A fetch that
 * fails leaves the cached copy standing — last week's calendar beats an
 * error on a train, the same trade the server makes with its stale copy.
 */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnyRec, Rec } from '@calmind/core';
import { apiPost, type Session } from './api';

const icsKey = (recId: string) => `calmind.ics.${recId}`;
const REFRESH_MS = 20 * 60 * 1000;

export function useSubIcs(recs: AnyRec[], session: Session | null): Record<string, string> {
  const [ics, setIcs] = useState<Record<string, string>>({});
  const fetchedAt = useRef<Record<string, number>>({});
  const known = useRef<Set<string>>(new Set());
  const subs = recs.filter((r): r is Rec<'calsub'> => r.type === 'calsub');
  // Only a subscription CHANGE re-runs the effect — recs itself changes on
  // every keystroke anywhere in the app, and that must not re-arm anything.
  const subsKey = JSON.stringify(subs.map((r) => [r.id, r.payload.url]));
  const subsRef = useRef(subs);
  subsRef.current = subs;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    let dead = false;
    // A changed URL is a different calendar: forget the old fetch time so the
    // next load fetches now rather than in twenty minutes.
    fetchedAt.current = {};
    const load = async () => {
      const cur = subsRef.current;
      const s = sessionRef.current;
      // A subscription that left takes its cache with it.
      const ids = new Set(cur.map((r) => r.id));
      for (const old of known.current) {
        if (!ids.has(old)) {
          known.current.delete(old);
          setIcs((m) => { const { [old]: _gone, ...rest } = m; return rest; });
          AsyncStorage.removeItem(icsKey(old)).catch(() => {});
        }
      }
      for (const sub of cur) {
        if (!known.current.has(sub.id)) {
          known.current.add(sub.id);
          const cached = await AsyncStorage.getItem(icsKey(sub.id)).catch(() => null);
          if (cached !== null && !dead) setIcs((m) => (sub.id in m ? m : { ...m, [sub.id]: cached }));
        }
        if (!s || Date.now() - (fetchedAt.current[sub.id] ?? 0) < REFRESH_MS) continue;
        // Stamped BEFORE the await, so a slow answer is not asked again.
        fetchedAt.current[sub.id] = Date.now();
        try {
          const r = await apiPost<{ ics: string }>(s.serverUrl, { action: 'calsub_fetch', url: sub.payload.url }, s.token);
          if (dead) return;
          setIcs((m) => ({ ...m, [sub.id]: r.ics }));
          AsyncStorage.setItem(icsKey(sub.id), r.ics).catch(() => {});
        } catch {
          // Offline, or the host is down: the cached copy stands.
        }
      }
    };
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    const appstate = AppState.addEventListener('change', (st) => { if (st === 'active') void load(); });
    return () => { dead = true; clearInterval(t); appstate.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subsKey, session === null]);
  return ics;
}
