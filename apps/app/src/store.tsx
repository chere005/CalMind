/**
 * The app's one stateful seam: a React context wrapping core's SyncEngine.
 * Local-first — every edit lands in the engine immediately and renders from it;
 * persistence (AsyncStorage) and the server round-trip trail behind, debounced.
 * The engine, merge rules and normalization all live in @calmind/core; this file
 * only wires them to React, storage, the app lifecycle and the watch.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncEngine, normalize, type AnyRec } from '@calmind/core';
import { type Session, syncTransport, ApiError } from './api';
import { pushWatchList } from './watch';

const SESSION_KEY = 'calmind.session';
const snapKey = (user: string) => `calmind.snapshot.${user}`;

type SyncState = 'idle' | 'syncing' | 'offline';

type Store = {
  ready: boolean;
  session: Session | null;
  recs: AnyRec[];
  syncState: SyncState;
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (s: Session) => Promise<void>; // token refresh (password change)
  mutate: (fn: (engine: SyncEngine) => void) => void;
  syncNow: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(new SyncEngine());
  const [ready, setReady] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const [recs, setRecs] = useState<AnyRec[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const timers = useRef<{ persist?: ReturnType<typeof setTimeout>; sync?: ReturnType<typeof setTimeout> }>({});

  // Seeding starters against an EMPTY engine that simply hasn't pulled yet would
  // duplicate everything the server already holds — normalize only runs once the
  // store is hydrated: a snapshot with a cursor, or one completed sync.
  const hydratedRef = useRef(false);

  /** Re-render from the engine, keep the shape guarantees, feed the watch. */
  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (hydratedRef.current) {
      const { added, edited } = normalize(engine.all());
      for (const r of [...added, ...edited]) engine.put(r);
    }
    const all = engine.all();
    setRecs(all);
    pushWatchList(all);
  }, []);

  const persistSoon = useCallback((user: string) => {
    clearTimeout(timers.current.persist);
    timers.current.persist = setTimeout(() => {
      AsyncStorage.setItem(snapKey(user), JSON.stringify(engineRef.current.toSnapshot())).catch(() => {});
    }, 300);
  }, []);

  const syncNow = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setSyncState('syncing');
    try {
      await engineRef.current.sync(syncTransport(s));
      hydratedRef.current = true; // the server has spoken — seeding is safe now
      setSyncState('idle');
    } catch (e) {
      // Offline is normal for a local-first app; a dead token is not.
      setSyncState('offline');
      if (e instanceof ApiError && e.status === 401) {
        await AsyncStorage.removeItem(SESSION_KEY);
        setSessionState(null);
        return;
      }
    }
    refresh();
    persistSoon(s.username);
  }, [refresh, persistSoon]);

  const syncSoon = useCallback(() => {
    clearTimeout(timers.current.sync);
    timers.current.sync = setTimeout(() => void syncNow(), 800);
  }, [syncNow]);

  // session in a ref so the periodic sync closure never goes stale.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const mutate = useCallback(
    (fn: (engine: SyncEngine) => void) => {
      fn(engineRef.current);
      refresh();
      if (sessionRef.current) {
        persistSoon(sessionRef.current.username);
        syncSoon();
      }
    },
    [refresh, persistSoon, syncSoon],
  );

  const signIn = useCallback(
    async (s: Session) => {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
      const snap = await AsyncStorage.getItem(snapKey(s.username));
      engineRef.current = SyncEngine.fromSnapshot(snap ? JSON.parse(snap) : null);
      hydratedRef.current = engineRef.current.toSnapshot().cursor > 0;
      setSessionState(s);
      sessionRef.current = s;
      refresh();
      void syncNow();
    },
    [refresh, syncNow],
  );

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    engineRef.current = new SyncEngine();
    hydratedRef.current = false;
    setSessionState(null);
    setRecs([]);
  }, []);

  const setSession = useCallback(async (s: Session) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSessionState(s);
  }, []);

  // Boot: restore the session and its snapshot, then catch up with the server.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Session;
        const snap = await AsyncStorage.getItem(snapKey(s.username));
        engineRef.current = SyncEngine.fromSnapshot(snap ? JSON.parse(snap) : null);
        hydratedRef.current = engineRef.current.toSnapshot().cursor > 0;
        setSessionState(s);
        sessionRef.current = s;
        refresh();
        void syncNow();
      }
      setReady(true);
    })();
  }, [refresh, syncNow]);

  // The revive rule, native edition: sync when the app comes back, and every 30s.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncNow();
    });
    const iv = setInterval(() => void syncNow(), 30000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [syncNow]);

  return (
    <Ctx.Provider value={{ ready, session, recs, syncState, signIn, signOut, setSession, mutate, syncNow }}>
      {children}
    </Ctx.Provider>
  );
}
