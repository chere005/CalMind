/**
 * The app's one stateful seam: a React context wrapping core's record engine.
 *
 * This is the LOCAL-ONLY edition. The upstream app is local-first with a server
 * behind it; here there is no server at all, so everything that existed to talk
 * to one is gone: the session, the login, the cursor, the dirty set, the
 * push/pull, the shared-partner reads. What is left is the half that was always
 * doing the work — the engine, the merge rules, normalization, and one snapshot
 * on disk.
 *
 * The CONTEXT SHAPE is deliberately unchanged. Twenty screens and components
 * read `session`, `syncState`, `sharedRecs` and the rest; rewriting their call
 * sites to prove a point would be a far larger change than making those fields
 * tell the truth about an app with no server. So `session` is a constant,
 * `syncState` is always idle, sharing is always empty, and the sync calls are
 * no-ops. Anything that reads them keeps working and renders the same as it
 * ever did.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncEngine, lastDeleted, normalize, prefsOf, recLabel, reminderToggle, todayStr, undeleted, type AnyRec, type Rec } from '@calmind/core';
import { drainWidgetTicks, onWatchTick, pushWatchIfWidgetMoved, pushWatchList } from './watch';
import { applyTheme, type ThemeName } from './theme';

/**
 * There are no accounts and no server, so there is no session — this is the one
 * store, and the only place its name is ever seen is the export's filename.
 *
 * It carries NO token and NO url. Upstream's `Session` had both; keeping the
 * shape "just in case" would have left a `serverUrl: ''` sitting in the code of
 * an app whose whole point is not having one.
 */
export type LocalStoreName = { username: string };
export const LOCAL_STORE: LocalStoreName = { username: 'local' };

const SNAP_KEY = 'calmind.local.snapshot';

/** Kept so `SyncDot` and Settings keep compiling; only ever 'idle' here. */
type SyncState = 'idle' | 'syncing' | 'offline' | 'refused';

export type PartnerBadge = { name: string; mutual: boolean };

type Store = {
  ready: boolean;
  session: LocalStoreName | null;
  recs: AnyRec[];
  syncState: SyncState;
  /** This device could not write its local copy — a relaunch would lose work. */
  persistFailed: boolean;
  refusedLabels: string[];
  mutate: (fn: (engine: SyncEngine) => void) => void;
  undoLastDelete: () => string | null;
  partners: PartnerBadge[];
  sharedPartner: string | null;
  sharedPartnerLabel: string | null;
  sharedRecs: AnyRec[];
  sharedPut: (rec: AnyRec) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

/** Sharing needs two accounts and a server to arbitrate between them. There is
 *  neither, so these are frozen empties rather than state nobody writes. */
const NO_PARTNERS: PartnerBadge[] = [];
const NO_SHARED: AnyRec[] = [];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(new SyncEngine());
  const [ready, setReady] = useState(false);
  const [recs, setRecs] = useState<AnyRec[]>([]);
  const [persistFailed, setPersistFailed] = useState(false);

  /**
   * Seeding starters against an engine that has not LOADED yet would write a
   * second set over the top of the first on every launch. Upstream this waits
   * for a cursor or a completed sync; here it waits for the one thing that can
   * be waited for — the read off disk having been attempted.
   */
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
    pushWatchList(all, null);
  }, []);

  /**
   * Persist IMMEDIATELY on every change.
   *
   * A debounce here meant an edit made just before a relaunch never reached the
   * snapshot and quietly vanished. It matters more in this build than upstream:
   * there, the snapshot is a cache of what the server holds and losing it costs
   * a resync. Here it is the only copy on this device.
   *
   * A failure is SAID, not swallowed. It is the quietest kind of loss there is
   * — everything keeps working, and then a relaunch comes back to yesterday.
   */
  const persistNow = useCallback(() => {
    AsyncStorage.setItem(SNAP_KEY, JSON.stringify(engineRef.current.toSnapshot()))
      .then(() => setPersistFailed(false))
      .catch(() => setPersistFailed(true));
  }, []);

  const mutateRef = useRef<((fn: (engine: SyncEngine) => void) => void) | null>(null);

  /**
   * Restore the most recently deleted reminder/event/note/habit.
   *
   * Read from the SNAPSHOT rather than `recs`: the engine's all() filters
   * deleted records out, so the live list this app renders from cannot see a
   * tombstone at all. Passing that list here would find nothing, for ever, and
   * the menu would look like a feature nobody had asked for.
   */
  const undoLastDelete = useCallback((): string | null => {
    const gone = lastDeleted(engineRef.current.toSnapshot().recs);
    if (!gone) return null;
    const label = recLabel(gone);
    mutateRef.current?.((e) => e.put(undeleted(gone)));
    return label;
  }, []);

  const mutate = useCallback(
    (fn: (engine: SyncEngine) => void) => {
      fn(engineRef.current);
      refresh();
      persistNow();
    },
    [refresh, persistNow],
  );
  mutateRef.current = mutate;

  // A tick from the watch is a tap by other means: the same toggle, the same
  // mutate, so repeats roll and the next push refreshes the watch. A tick for a
  // record that has gone drops silently — there is nothing left to toggle.
  useEffect(
    () =>
      onWatchTick((id) => {
        mutate((e) => {
          const rec = e.all().find((r) => r.id === id && r.type === 'reminder' && !r.deleted) as Rec<'reminder'> | undefined;
          if (rec) e.put({ ...rec, payload: reminderToggle(rec.payload, todayStr()) });
        });
      }),
    [mutate],
  );

  // The widget's check-offs, applied when the app comes forward. Same
  // destination as a watch tick, so a box ticked on the home screen behaves
  // exactly like one tapped in the app.
  useEffect(() => {
    const apply = () => {
      const ids = drainWidgetTicks();
      if (ids.length === 0) return;
      mutate((e) => {
        for (const id of ids) {
          const rec = e.all().find((r) => r.id === id && r.type === 'reminder' && !r.deleted) as Rec<'reminder'> | undefined;
          if (rec) e.put({ ...rec, payload: reminderToggle(rec.payload, todayStr()) });
        }
      });
    };
    apply();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        apply();
        pushWatchIfWidgetMoved(engineRef.current.all(), null);
      }
    });
    return () => sub.remove();
  }, [mutate]);

  useEffect(() => {
    // Always, even with no saved preference: applyTheme is what writes the page
    // background, and skipping it leaves it to whatever was baked in.
    applyTheme((prefsOf(recs, 'suite').theme as ThemeName) || 'midnight');
  }, [recs]);

  /**
   * Boot: read the snapshot.
   *
   * NOTHING here may prevent setReady(true). Unguarded, this is the worst
   * failure the app can have: a snapshot that will not parse throws out of this
   * function, setReady never runs, and the app sits on a blank screen FOREVER —
   * not an error, not an empty list, a permanent nothing that survives every
   * relaunch because the bad bytes are still there.
   *
   * A snapshot that will not parse is KEPT, not dropped, and that is the one
   * place this build must differ from upstream. There the snapshot is a cache
   * and dropping it costs a resync; here it is the only copy, and an empty
   * store is indistinguishable from a fresh install — the app would offer to
   * make a first reminder and the next write would go over the top of whatever
   * is in that file. So it is moved aside under its own key and `persistFailed`
   * says so.
   */
  useEffect(() => {
    (async () => {
      try {
        const snap = await AsyncStorage.getItem(SNAP_KEY).catch(() => null);
        let parsed: unknown = null;
        if (snap) {
          try {
            parsed = JSON.parse(snap);
          } catch {
            await AsyncStorage.setItem(`${SNAP_KEY}.unreadable.${Date.now()}`, snap).catch(() => {});
            setPersistFailed(true);
            parsed = null;
          }
        }
        engineRef.current = SyncEngine.fromSnapshot(parsed as never);
      } finally {
        hydratedRef.current = true;
        refresh();
        setReady(true);
      }
    })();
  }, [refresh]);

  // Sharing needs a second account and a server to arbitrate between them, so
  // its one write is a no-op rather than state nobody sets.
  const sharedPut = useCallback(async (_rec: AnyRec) => {}, []);

  return (
    <Ctx.Provider
      value={{
        ready,
        session: LOCAL_STORE,
        recs,
        syncState: 'idle',
        persistFailed,
        refusedLabels: [],
        mutate,
        undoLastDelete,
        partners: NO_PARTNERS,
        sharedPartner: null,
        sharedPartnerLabel: null,
        sharedRecs: NO_SHARED,
        sharedPut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
