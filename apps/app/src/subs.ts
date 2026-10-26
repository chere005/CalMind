/** Calendar content stays outside the sync snapshot and refreshes on foreground. */
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasCalendarFeed, subIdentity, type AnyRec, type Rec } from '@calmind/core';
import { apiPost, type Session } from './api';

const REFRESH_MS = 20 * 60 * 1000;
const cacheKey = (scope: string, id: string) => `calmind.ics@${scope}.${id}`;
type CachedFeed = { identity: string; ics: string };

export function useSubIcs(recs: AnyRec[], session: Session | null): Record<string, string> {
  // Account and server both matter: native storage and web origins can each
  // hold several CalMind instances. Never reuse one account's remote feed.
  const scope = session ? JSON.stringify([session.serverUrl, session.username]) : '';
  const [state, setState] = useState<{ scope: string; feeds: Record<string, CachedFeed> }>({ scope, feeds: {} });
  const subs = recs.filter((r): r is Rec<'calsub'> => r.type === 'calsub');
  // Renaming/recolouring does not refetch; a connection or credential change does.
  const subsKey = JSON.stringify(subs.map((r) => [r.id, subIdentity(r.payload), r.payload.source, r.payload.password]));
  const previous = useRef<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });

  useEffect(() => {
    let dead = false;
    let loading = false;
    // Keep the request, subscriptions, and cache namespace from the same
    // render. A foreground callback from this effect must never combine a
    // newly signed-in account's refs with the previous account's cache scope.
    const currentSession = session;
    const currentSubs = subs;
    const fetchedAt: Record<string, number> = {};
    const known = new Set<string>();
    const connections = new Map(currentSubs.map((sub) => [sub.id, subIdentity(sub.payload)]));
    if (previous.current.scope === scope) {
      for (const old of previous.current.ids) {
        if (!connections.has(old)) {
          // Feed caches are disposable; a failed eviction never affects records.
          AsyncStorage.removeItem(cacheKey(scope, old)).catch(() => {});
        }
      }
    }
    previous.current = { scope, ids: new Set(connections.keys()) };
    setState((old) => ({
      scope,
      feeds: old.scope === scope ? Object.fromEntries(Object.entries(old.feeds)
        .filter(([id, feed]) => connections.get(id) === feed.identity)) : {},
    }));
    const put = (id: string, feed: CachedFeed) => {
      if (!dead) setState((old) => old.scope === scope ? { scope, feeds: { ...old.feeds, [id]: feed } } : old);
    };
    const load = async () => {
      if (dead || loading || !scope || !currentSession) return;
      loading = true;
      try {
        for (const sub of currentSubs) {
          if (dead) return;
          const identity = subIdentity(sub.payload);
          if (!known.has(sub.id)) {
            known.add(sub.id);
            const raw = await AsyncStorage.getItem(cacheKey(scope, sub.id)).catch(() => null);
            try {
              const cached = raw ? JSON.parse(raw) as CachedFeed : null;
              if (cached?.identity === identity && typeof cached.ics === 'string') put(sub.id, cached);
            } catch { /* An invalid cache is fetched again. */ }
          }
          if (dead) return;
          if (Date.now() - (fetchedAt[sub.id] ?? 0) < REFRESH_MS) continue;
          fetchedAt[sub.id] = Date.now();
          try {
            const payload = sub.payload;
            const response = await apiPost<{ ics: string }>(currentSession.serverUrl, {
              action: 'calsub_fetch', url: payload.url,
              ...(payload.source ? { source: payload.source } : {}),
              ...(payload.source === 'caldav' ? { username: payload.username, password: payload.password } : {}),
            }, currentSession.token);
            if (dead) return;
            if (!hasCalendarFeed(response.ics)) continue;
            const feed = { identity, ics: response.ics };
            put(sub.id, feed);
            // Keeping an offline copy is best-effort, like the previous feed cache.
            AsyncStorage.setItem(cacheKey(scope, sub.id), JSON.stringify(feed)).catch(() => {});
          } catch {
            // Failed refreshes keep this connection's last good calendar offline.
          }
        }
      } finally { loading = false; }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const appstate = AppState.addEventListener('change', (next) => { if (next === 'active') void load(); });
    return () => { dead = true; clearInterval(timer); appstate.remove(); };
  }, [scope, subsKey, session?.token]);

  if (state.scope !== scope) return {};
  return Object.fromEntries(subs.flatMap((sub) => {
    const feed = state.feeds[sub.id];
    return feed?.identity === subIdentity(sub.payload) ? [[sub.id, feed.ics]] : [];
  }));
}
