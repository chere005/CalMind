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
import { SyncEngine, normalize, prefsOf, folderApp, shareOf, type AnyRec, type Rec } from '@calmind/core';
import { apiPost, type Session, syncTransport, ApiError } from './api';
import { pushWatchList } from './watch';
import { applyTheme, type ThemeName } from './theme';

const SESSION_KEY = 'calmind.session';
const snapKey = (user: string) => `calmind.snapshot.${user}`;

// 'refused' is not a kind of offline: the connection is fine and the server
// answered. One record is simply too big to store, and it is still sitting
// on this device only.
type SyncState = 'idle' | 'syncing' | 'offline' | 'refused';

export type PartnerBadge = { name: string; mutual: boolean };

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
  /** Sharing: the first mutual partner's shared records, read-only copies
   *  refreshed with every sync; writes go through sharedPut, never the
   *  engine — a partner's store is not ours to hold a cursor into. */
  partners: PartnerBadge[];
  sharedPartner: string | null;
  /** My display label for the partner (share-window rename), else the name. */
  sharedPartnerLabel: string | null;
  sharedRecs: AnyRec[];
  sharedPut: (rec: AnyRec) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(new SyncEngine());
  const [ready, setReady] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const [recs, setRecs] = useState<AnyRec[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [partners, setPartners] = useState<PartnerBadge[]>([]);
  const [sharedPartner, setSharedPartner] = useState<string | null>(null);
  const [sharedRaw, setSharedRaw] = useState<AnyRec[]>([]);
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

  // Persist IMMEDIATELY on every change — a debounce here meant an edit made
  // just before a reload never reached the snapshot and quietly vanished
  // (caught by the e2e drag spec). Only the network round-trip is debounced.
  const persistNow = useCallback((user: string) => {
    AsyncStorage.setItem(snapKey(user), JSON.stringify(engineRef.current.toSnapshot())).catch(() => {});
  }, []);

  const pullShared = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const r = await apiPost<{ partners: PartnerBadge[]; partner: string | null; records: AnyRec[] }>(
        s.serverUrl, { action: 'shared_pull' }, s.token,
      );
      setPartners(r.partners);
      setSharedPartner(r.partner);
      setSharedRaw(r.records);
    } catch {
      // Offline: the last pulled copy stands, like any local-first read.
    }
  }, []);

  const syncNow = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setSyncState('syncing');
    try {
      await engineRef.current.sync(syncTransport(s));
      hydratedRef.current = true; // the server has spoken — seeding is safe now
      setSyncState(engineRef.current.rejected().length > 0 ? 'refused' : 'idle');
      void pullShared();
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
    persistNow(s.username);
  }, [refresh, persistNow, pullShared]);

  // Every caller fires this and forgets it (`void sharedPut(...)`), so a
  // rejection here had nowhere to go but an unhandled promise: tapping a
  // partner's tick did nothing, said nothing, and logged somewhere the user
  // will never look. It rejects for an ordinary reason, too — sharing ending
  // a moment earlier makes this a 403, and a dead token a 401.
  //
  // Reconciling either way is the honest answer: pullShared re-reads what the
  // partner still shares, so rows that are no longer ours to touch leave the
  // screen instead of sitting there swallowing taps.
  const sharedPut = useCallback(async (rec: AnyRec) => {
    const s = sessionRef.current;
    if (!s || !sharedPartner) return;
    try {
      await apiPost(s.serverUrl, { action: 'shared_put', partner: sharedPartner, record: { ...rec, updated: Date.now() } }, s.token);
    } catch {
      // fall through to the reconcile — the screen is what's wrong now
    }
    await pullShared().catch(() => {});
  }, [sharedPartner, pullShared]);

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
        persistNow(sessionRef.current.username);
        syncSoon();
      }
    },
    [refresh, persistNow, syncSoon],
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

  // The suite's folder_shared_color(): the viewer's own recolour override
  // wins over the owner's colour, resolved HERE so the picker, the shared
  // views, the All blocks, the cells and the legend all follow for free.
  const sharedPartnerLabel = React.useMemo(
    () => (sharedPartner ? shareOf(recs).labels?.[sharedPartner] ?? sharedPartner : null),
    [recs, sharedPartner],
  );

  const sharedRecs = React.useMemo(() => {
    if (!sharedPartner || sharedRaw.length === 0) return sharedRaw;
    const key = (id: string) => `@${sharedPartner}:${id}`;
    return sharedRaw.map((r) => {
      if (r.type === 'folder') {
        const over = prefsOf(recs, folderApp((r as Rec<'folder'>).payload))?.sharedColors?.[key(r.id)];
        return over ? { ...r, payload: { ...r.payload, color: over } } : r;
      }
      if (r.type === 'calendar') {
        const over = prefsOf(recs, 'calendar').sharedColors?.[key(r.id)];
        return over ? { ...r, payload: { ...r.payload, color: over } } : r;
      }
      return r;
    }) as AnyRec[];
  }, [sharedRaw, sharedPartner, recs]);

  useEffect(() => {
    // Always, even with no saved preference: applyTheme is what writes
    // theme-color and the page background, and skipping it left both to the
    // constant baked in at export time — right for midnight by luck, wrong
    // for every other theme.
    applyTheme((prefsOf(recs, 'suite').theme as ThemeName) || 'midnight');
  }, [recs]);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    engineRef.current = new SyncEngine();
    hydratedRef.current = false;
    setSessionState(null);
    setRecs([]);
    setPartners([]);
    setSharedPartner(null);
    setSharedRaw([]);
    applyTheme('midnight'); // the login page always renders midnight
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
    <Ctx.Provider value={{ ready, session, recs, syncState, signIn, signOut, setSession, mutate, syncNow, partners, sharedPartner, sharedPartnerLabel, sharedRecs, sharedPut }}>
      {children}
    </Ctx.Provider>
  );
}
