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
import {
  CALENDAR_STARTER, FOLDER_CALENDAR, FOLDER_NOTES_STARTER, FOLDER_STARTER,
  HABIT_SECTION_STARTER, SECTION_DEFAULT,
  SyncEngine, lastDeleted, normalize, ordBetween, prefsOf, recLabel, reminderToggle,
  todayStr, undeleted, type AnyRec, type Rec,
} from '@calmind/core';
import { drainWidgetTicks, onWatchTick, pushWatchIfWidgetMoved, pushWatchList } from './watch';
import { deviceLabel, peerAvailable, sendAllTo, sendRecords, startPeer, stopPeer, type Peer, type PeerState } from './peer';
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
  /** The other devices on this network that know the passphrase. */
  peers: Peer[];
  peerState: PeerState;
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

/**
 * The starter records, with FIXED ids.
 *
 * This is the one thing an app with no server has to do differently, and it is
 * not cosmetic. `normalize` seeds its starters with `newId()`, which is right
 * when a server holds the one true copy: exactly one device ever seeds, and
 * everybody else pulls what it made. Here every device seeds for itself, and
 * two that each did so before meeting do not COLLIDE — they DUPLICATE. Two
 * "Reminders" folders, two "Calendar" folders, two habit sections, for ever,
 * with nothing able to say afterwards which was which.
 *
 * Seen, not imagined: two simulators paired after both had run alone, and the
 * merged list had every starter twice.
 *
 * So the starters are written HERE, with ids derived from what they are rather
 * than from a random number. Two devices that seed independently produce byte
 * for byte the same records, and the merge folds them into one. `normalize`
 * then finds everything it would have made already present and adds nothing —
 * which is why this can live in the app instead of as a change to core, and
 * core stays an unmodified clone.
 *
 * The colours repeat core's own seed values; they are module-private there.
 */
function starterRecords(): AnyRec[] {
  const ord = ordBetween(null, null);
  const folder = (id: string, name: string, color: string, app: 'reminders' | 'notes', rideAlong?: boolean): AnyRec => ({
    id, type: 'folder', updated: 0,
    payload: { name, color, ord, app, ...(rideAlong ? { rideAlong: true } : {}) },
  });
  const section = (id: string, folderId: string): AnyRec => ({
    id, type: 'section', updated: 0, payload: { name: SECTION_DEFAULT, folderId, ord },
  });
  return [
    folder('lf_reminders', FOLDER_STARTER, '#4c8bf0', 'reminders'),
    // The ride-along folder: an undated open reminder in it shows on the
    // calendar under today, every day, until ticked.
    folder('lf_calendar', FOLDER_CALENDAR, '#66d695', 'reminders', true),
    folder('lf_notes', FOLDER_NOTES_STARTER, '#7dc2ed', 'notes'),
    section('ls_reminders', 'lf_reminders'),
    section('ls_calendar', 'lf_calendar'),
    section('ls_notes', 'lf_notes'),
    { id: 'lc_personal', type: 'calendar', updated: 0, payload: { name: CALENDAR_STARTER, color: '#0379f6', ord } },
    { id: 'lh_habits', type: 'habitsection', updated: 0, payload: { name: HABIT_SECTION_STARTER, color: '#4357ef', ord } },
  ];
}

/** Sharing needs two accounts and a server to arbitrate between them. There is
 *  neither, so these are frozen empties rather than state nobody writes. */
const NO_PARTNERS: PartnerBadge[] = [];
const NO_SHARED: AnyRec[] = [];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef(new SyncEngine());
  const [ready, setReady] = useState(false);
  const [recs, setRecs] = useState<AnyRec[]>([]);
  const [persistFailed, setPersistFailed] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [peerState, setPeerState] = useState<PeerState>({ state: 'off', detail: '' });

  /**
   * Whether it is safe to seed the starter folders yet.
   *
   * Upstream waits for a cursor or a completed sync — proof the server has
   * spoken. Here the equivalent proof is one of three things: this device
   * already HAS records, a peer has sent us some, or enough time has passed
   * that there is evidently nobody to ask.
   *
   * Waiting matters, and getting it wrong is not subtle. Starters are created
   * with fresh ids, so two devices that each seed independently do not collide
   * — they DUPLICATE. Pair a new Mac with a phone that already has data and you
   * would get two "Reminders" folders, two "Calendar" folders and two habit
   * sections, for ever, with no rule able to tell which was which afterwards.
   */
  const hydratedRef = useRef(false);
  const seedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /** Put the fixed starters in, unless this store already holds them. */
  const seedStarters = useCallback(() => {
    const engine = engineRef.current;
    const held = new Set(engine.toSnapshot().recs.map((r) => r.id));
    const missing = starterRecords().filter((r) => !held.has(r.id));
    for (const r of missing) engine.put(r);
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
      // What CHANGED, by comparing stamps either side of the edit. The engine
      // has no "what did you just write" callback, and asking it for its dirty
      // set would not do: nothing clears that set in an app with no server, so
      // it only grows and every edit would re-send the whole store.
      const before = new Map(engineRef.current.toSnapshot().recs.map((r) => [r.id, r.updated]));
      fn(engineRef.current);
      refresh();
      persistNow();
      const changed = engineRef.current.toSnapshot().recs.filter((r) => before.get(r.id) !== r.updated);
      if (changed.length > 0) sendRecords(changed);
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
   * The Bonjour link.
   *
   * Records arriving from a peer are merged by CORE's rule, not one written
   * here: `mergeSnapshot` is the same last-write-wins the app has always used,
   * and it does not re-stamp what it takes — re-stamping on arrival would make
   * every device's copy newer than every other's and the two would trade the
   * same record back and forth for ever.
   */
  useEffect(() => {
    if (!peerAvailable()) return;
    startPeer(deviceLabel(), {
      onRecords: (incoming) => {
        const took = engineRef.current.mergeSnapshot({ cursor: 0, recs: incoming, dirty: [] });
        // A peer having anything to say is proof there is a store to join, so
        // the starters must NOT be seeded on top of it.
        hydratedRef.current = true;
        if (seedTimer.current) { clearTimeout(seedTimer.current); seedTimer.current = null; }
        if (took) {
          refresh();
          persistNow();
        }
      },
      onPeers: (list) => {
        setPeers(list);
        // A peer that has just appeared has never heard any of this. Tombstones
        // go too: a device that has never met this one needs the deletes as
        // much as the records.
        for (const p of list) sendAllTo(p.id, engineRef.current.toSnapshot().recs);
      },
      onState: setPeerState,
    }).catch((e) => setPeerState({ state: 'failed', detail: String(e) }));
    return () => stopPeer();
  }, [refresh, persistNow]);

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
        const held = engineRef.current.toSnapshot().recs.length > 0;
        if (held) {
          // This device already has a store; its starters are long since made.
          hydratedRef.current = true;
        } else if (peerAvailable()) {
          // Empty, and there may be a device on this network holding the real
          // store. Give it a moment to say so before writing a second set of
          // starters that nothing could ever reconcile.
          seedTimer.current = setTimeout(() => {
            seedStarters();
            hydratedRef.current = true;
            refresh();
            // Persist, and this is not optional: `refresh` only re-renders.
            // Without it the starters live in memory until the first edit, so
            // an app opened and closed without touching anything comes back to
            // an empty store — and seeds again, for ever.
            persistNow();
          }, 6000);
        } else {
          seedStarters();
          hydratedRef.current = true;
        }
        refresh();
        persistNow();
        setReady(true);
      }
    })();
  }, [refresh, persistNow, seedStarters]);

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
        peers,
        peerState,
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
