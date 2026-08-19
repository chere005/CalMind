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
import { watchForUpdate } from './update';
import { SyncEngine, lastDeleted, normalize, prefsOf, folderApp, recLabel, reminderToggle, shareOf, todayStr, undeleted, type AnyRec, type Rec, type Snapshot } from '@calmind/core';
import { apiPost, type Session, syncTransport, ApiError } from './api';
import { drainWidgetTicks, onWatchTick, pushWatchIfWidgetMoved, pushWatchList } from './watch';
import { applyTheme, type ThemeName } from './theme';

const SESSION_KEY = 'calmind.session';
const snapKey = (user: string) => `calmind.snapshot.${user}`;

/**
 * Forget the stored session — and if storage refuses to delete it, leave
 * something behind that cannot be read as one.
 *
 * Both callers already treat the removal as allowed to fail, and say why:
 * clearing memory is what signs you out, so a refusing store must never take
 * the sign-out with it. That is right, and normally the leftover is harmless
 * because the server revokes the token on logout — proven, not assumed: with
 * removeItem throwing, the token stays on disk and the next launch still
 * lands on the login page, because the server rejects it.
 *
 * OFFLINE it does not. There is no server to reject anything, so the launch
 * path restores the session and shows that account's cached snapshot on a
 * device where Log out was pressed. Narrow — it needs a storage failure AND
 * no network — but the whole point of the rule about silent write failures
 * is that this is the shape they take.
 *
 * The launch path already drops a session that will not parse, so a value
 * that cannot parse is the answer. If the store refuses this write too we
 * are exactly where we were, which is why it is best-effort in turn.
 */
async function forgetSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    await AsyncStorage.setItem(SESSION_KEY, 'signed out').catch(() => {});
  }
}

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
  /** This device could not write its local copy — a reload would lose work. */
  persistFailed: boolean;
  /** Names of records the server refused, so a warning can name them. */
  refusedLabels: string[];
  signIn: (s: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setSession: (s: Session) => Promise<void>; // token refresh (password change)
  mutate: (fn: (engine: SyncEngine) => void) => void;
  syncNow: () => Promise<void>;
  /** Restore the most recently deleted reminder/event/note/habit, and say
   *  what came back. null when there is nothing to undo. */
  undoLastDelete: () => string | null;
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
  const [persistFailed, setPersistFailed] = useState(false);
  /** The names of records the server refused, for a message that can point. */
  const [refusedLabels, setRefusedLabels] = useState<string[]>([]);
  const [partners, setPartners] = useState<PartnerBadge[]>([]);
  const [sharedPartner, setSharedPartner] = useState<string | null>(null);
  const [sharedRaw, setSharedRaw] = useState<AnyRec[]>([]);
  const timers = useRef<{ persist?: ReturnType<typeof setTimeout>; sync?: ReturnType<typeof setTimeout> }>({});

  // Seeding starters against an EMPTY engine that simply hasn't pulled yet would
  // duplicate everything the server already holds — normalize only runs once the
  // store is hydrated: a snapshot with a cursor, or one completed sync.
  const hydratedRef = useRef(false);

  /**
   * The partner's records as the watch feed wants them, in a REF.
   *
   * refresh() is a useCallback with no deps — deliberately, so every caller
   * gets the same stable function — which means it cannot read sharedRecs
   * from state without capturing a stale one. The ref is written by the
   * effect below and read here, and that effect also re-pushes, so the
   * widget's calendar picker updates when a partner's list changes rather
   * than only when one of MY records does.
   */
  const sharedForWatch = useRef<{ recs: AnyRec[]; partner: string } | null>(null);

  /** Re-render from the engine, keep the shape guarantees, feed the watch. */
  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (hydratedRef.current) {
      const { added, edited } = normalize(engine.all());
      for (const r of [...added, ...edited]) engine.put(r);
    }
    const all = engine.all();
    setRecs(all);
    pushWatchList(all, sharedForWatch.current);
  }, []);

  // Persist IMMEDIATELY on every change — a debounce here meant an edit made
  // just before a reload never reached the snapshot and quietly vanished
  // (caught by the e2e drag spec). Only the network round-trip is debounced.
  const persistNow = useCallback((user: string) => {
    // A failure here used to be swallowed whole. It is the quietest kind of
    // loss there is: everything keeps working, and then a reload comes back
    // to yesterday. Storage refuses for ordinary reasons — a full quota, a
    // browser wiping site data — so say it rather than carry on as if saved.
    AsyncStorage.setItem(snapKey(user), JSON.stringify(engineRef.current.toSnapshot()))
      .then(() => setPersistFailed(false))
      .catch(() => setPersistFailed(true));
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
      return true;
    } catch {
      // Offline: the last pulled copy stands, like any local-first read.
      // Reporting it matters only to a caller that NEEDED the reconcile —
      // see sharedPut, where a failed write plus a failed re-read means the
      // screen is knowingly showing something that is not true.
      return false;
    }
  }, []);

  /**
   * Everything that has to let go when there is no longer a session — whether
   * you pressed Log out or the server stopped recognising your token. Both
   * roads end on the login page, and it was only ever one of them that tidied
   * up: a 401 dropped the session and left the records, the partner and the
   * theme behind, so the login card rendered in the departed user's colours
   * and contradicted the line that says it always renders midnight.
   */
  const clearSession = useCallback(() => {
    engineRef.current = new SyncEngine();
    hydratedRef.current = false;
    setSessionState(null);
    setRecs([]);
    setPartners([]);
    setSharedPartner(null);
    setSharedRaw([]);
    applyTheme('midnight'); // the login page always renders midnight
  }, []);

  // One sync at a time. The poll fires every 30 seconds regardless of whether
  // the last one finished, so a request that hangs — accepted, never answered —
  // used to have another started on top of it, and another, for as long as the
  // stall lasted: four in ninety-five seconds, measured, each holding a socket
  // and none of them ever recovering. Two concurrent syncs of one engine are
  // no use even when the network is healthy; they race the same dirty set.
  const syncing = useRef(false);
  // …but a request that arrives DURING one is remembered, not dropped. The
  // guard alone traded a pile-up for a delay: an edit made while a slow sync
  // was in flight had its debounced push skipped, and then waited for the
  // thirty-second poll, because the running sync only carries what was dirty
  // when it STARTED. One extra pass afterwards costs nothing and is what the
  // debounce was promising in the first place.
  const syncAgain = useRef(false);

  const syncNow = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    setSyncState('syncing');
    // The OUTER try exists only for the finally: the 401 path below returns
    // early, and a flag released on some exits and not others wedges syncing
    // for the life of the page — a worse bug than the pile-up it prevents.
    try {
    try {
      await engineRef.current.sync(syncTransport(s));
      hydratedRef.current = true; // the server has spoken — seeding is safe now
      // WHICH record was refused, not merely that one was. "A note is too
      // long to save" in an app holding hundreds of them leaves you to find
      // it yourself, and the note is by definition not the one on screen.
      const refused = engineRef.current.rejected();
      const snap = engineRef.current.toSnapshot().recs;
      setRefusedLabels(refused.map((id) => {
        const rec = snap.find((r) => r.id === id);
        return rec ? recLabel(rec) : id;
      }));
      setSyncState(refused.length > 0 ? 'refused' : 'idle');
      void pullShared();
    } catch (e) {
      // Offline is normal for a local-first app; a dead token is not.
      setSyncState('offline');
      if (e instanceof ApiError && e.status === 401) {
        // The removal is allowed to fail — persistNow already documents that
        // storage refuses for ordinary reasons — but it must not take the
        // sign-out with it. Unguarded, a throw here escaped this catch
        // entirely (an unhandled rejection, since every caller does `void
        // syncNow()`) AND left the dead session on disk to be restored on the
        // next launch. Clearing memory is what actually signs you out; the
        // disk copy is a cache.
        await forgetSession();
        clearSession();
        return;
      }
    }
    refresh();
    persistNow(s.username);
    } finally {
      syncing.current = false;
      // Only if there is still a session: the 401 path above clears it and
      // returns through here, and syncing after a sign-out is both useless and
      // a way to resurrect a dead token's error.
      if (syncAgain.current && sessionRef.current) {
        syncAgain.current = false;
        void syncNow();
      } else {
        syncAgain.current = false;
      }
    }
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
    let wrote = true;
    try {
      await apiPost(s.serverUrl, { action: 'shared_put', partner: sharedPartner, record: { ...rec, updated: Date.now() } }, s.token);
    } catch {
      // fall through to the reconcile — the screen is what's wrong now
      wrote = false;
    }
    const reconciled = await pullShared();
    // The outer .catch(() => {}) that used to sit here caught nothing —
    // pullShared handles its own failure — so it only hid where the real
    // swallow was. The case that actually matters is BOTH failing: the edit
    // did not land AND the screen was not corrected, so a partner's row sits
    // there showing a change that does not exist anywhere but this device.
    // 'offline' is already the word this app uses for that, and the top bar
    // already shows it.
    if (!wrote && !reconciled) setSyncState('offline');
  }, [sharedPartner, pullShared]);

  const syncSoon = useCallback(() => {
    clearTimeout(timers.current.sync);
    timers.current.sync = setTimeout(() => void syncNow(), 800);
  }, [syncNow]);

  // session in a ref so the periodic sync closure never goes stale.
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  /**
   * The newest tombstone, restored.
   *
   * Read from the SNAPSHOT rather than `recs`: the engine's all() filters
   * deleted records out, so the live list this app renders from cannot see a
   * tombstone at all. Passing that list here would find nothing, for ever,
   * and the menu would look like a feature nobody had asked for.
   */
  const mutateRef = useRef<((fn: (engine: SyncEngine) => void) => void) | null>(null);
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
      if (sessionRef.current) {
        persistNow(sessionRef.current.username);
        syncSoon();
      }
    },
    [refresh, persistNow, syncSoon],
  );
  mutateRef.current = mutate;


  // A tick from the watch is a tap by other means: the same toggle, the same
  // mutate, so repeats roll and the next push refreshes the watch. A tick for
  // a record that has gone (deleted on another device while the watch was
  // offline) drops silently — there is nothing left to toggle.
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
  // destination as a watch tick — reminderToggle — so a box ticked on the
  // home screen behaves exactly like one tapped in the app.
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
    apply(); // whatever was queued while the app was away
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      apply();
      // The widget's calendar selection may have moved while the app was
      // away, and nothing notifies us when it does — so the watch mirrored
      // the OLD selection until the next unrelated push (the one-push-behind
      // bug, fixed on Sean's word 2026-08-18). A no-op when nothing moved.
      pushWatchIfWidgetMoved(engineRef.current.all(), sharedForWatch.current);
    });
    return () => sub.remove();
  }, [mutate]);

  /**
   * The OTHER tab's writes, folded in as they land (web only — native has one
   * JS runtime and no second tab). Two tabs share one snapshot key and each
   * used to write the whole snapshot over the other's, so offline, a reload
   * kept only the last writer's work — e2e/twotab.spec.ts, a fixme since
   * 2026-08-11. Sean's "get all of that done" (2026-08-19) unblocked it; of
   * the three options the TODO entry laid out, this is the recommended one —
   * the listener reuses machinery that already exists.
   *
   * The merge itself is core's (SyncEngine.mergeSnapshot, sync's own LWW
   * rules), so a mid-sentence arrival cannot eat the sentence any more than a
   * server pull can: the editor's draft state survives a re-render, which is
   * the protection clobber.spec pins. Persisting only when something CHANGED
   * is what stops the two tabs ping-ponging storage events forever — tab A
   * persists the union, tab B folds A's half in and persists once more, and
   * the third bounce merges nothing and writes nothing.
   *
   * The `storage` event only ever fires in the tabs that did NOT write, so
   * none of this runs in the tab whose keystroke it was.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const onStorage = (ev: StorageEvent) => {
      const s = sessionRef.current;
      if (!s || ev.key !== snapKey(s.username) || !ev.newValue) return;
      let snap: Snapshot | null = null;
      try {
        snap = JSON.parse(ev.newValue) as Snapshot;
      } catch {
        return; // a corrupt snapshot is a cache problem, not a merge input
      }
      if (!snap || !Array.isArray(snap.recs)) return;
      if (engineRef.current.mergeSnapshot(snap)) {
        refresh();
        persistNow(s.username); // the union, so a reload right now loses neither tab
        syncSoon(); // and offer it to the server when there is one
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh, persistNow, syncSoon]);

  const signIn = useCallback(
    async (s: Session) => {
      // Signing in must not depend on the disk. Unguarded, storage refusing
      // threw before the engine was built and before setSessionState — so a
      // CORRECT password bounced you back to the login screen with no error
      // at all. persistFailed is the existing way this app says 'saved
      // nothing', and Settings already shows it; reuse that rather than fail
      // the sign-in.
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s))
        .then(() => setPersistFailed(false))
        .catch(() => setPersistFailed(true));
      const snap = await AsyncStorage.getItem(snapKey(s.username)).catch(() => null);
      // The PARSE needs guarding as much as the read did — guarding only the
      // read was this same bug one layer in. A corrupt snapshot threw here,
      // signIn threw, and Login showed 'something went wrong' every single
      // time, forever, because the bad bytes are still on disk. You could
      // never sign in on that device again. It is a cache; drop it.
      let restored: unknown = null;
      try {
        restored = snap ? JSON.parse(snap) : null;
      } catch {
        restored = null;
      }
      engineRef.current = SyncEngine.fromSnapshot(restored as never);
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
    // Same rule as the 401 path, and this one matters more because it is the
    // deliberate act: pressing Log out with storage refusing used to throw
    // before clearSession, so nothing happened and you stayed signed in with
    // no error at all. The disk copy is a cache; clearing memory is the
    // sign-out. Do that regardless.
    await forgetSession();
    clearSession();
  }, [clearSession]);

  const setSession = useCallback(async (s: Session) => {
    // Same rule: a refreshed token must reach memory even if the disk will
    // not take it, or the app keeps using the old one it can no longer save.
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s))
      .then(() => setPersistFailed(false))
      .catch(() => setPersistFailed(true));
    setSessionState(s);
  }, []);

  // Boot: restore the session and its snapshot, then catch up with the server.
  useEffect(() => {
    (async () => {
      // NOTHING here may prevent setReady(true). Unguarded, this was the
      // worst failure in the app: a corrupt session or snapshot in storage —
      // or storage simply refusing — threw out of this function, setReady
      // never ran, and the app sat on its loading screen FOREVER. Not an
      // error, not a login page: a permanent blank. And it would survive
      // every relaunch, because the bad bytes are still there.
      //
      // So each step is allowed to fail on its own terms: an unreadable
      // session means signed out, an unreadable snapshot means a fresh
      // engine. Damaged data costs you a login, never the app.
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
        let s: Session | null = null;
        try {
          s = raw ? (JSON.parse(raw) as Session) : null;
        } catch {
          // A session that will not parse is not a session. Drop it rather
          // than meet it again on every launch.
          await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
        }
        if (s) {
          const snap = await AsyncStorage.getItem(snapKey(s.username)).catch(() => null);
          let parsed: unknown = null;
          try {
            parsed = snap ? JSON.parse(snap) : null;
          } catch {
            // The snapshot is a CACHE of what the server holds. Losing it
            // costs a resync, which the sync below does anyway.
            parsed = null;
          }
          engineRef.current = SyncEngine.fromSnapshot(parsed as never);
          hydratedRef.current = engineRef.current.toSnapshot().cursor > 0;
          setSessionState(s);
          sessionRef.current = s;
          refresh();
          void syncNow();
        }
      } finally {
        setReady(true);
      }
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

  // ...and the web edition of the same rule, for the page itself rather than
  // the data. An installed home-screen app is resumed, not reloaded, so it can
  // sit on a build from weeks ago while every deploy since passes it by. This
  // asks on return whether the server is serving something else, and takes it
  // only when nothing is still owed — the engine's own dirty count is the
  // guard, so a reload can never land on top of unsent typing.
  // OFF unless the page asks for it (2026-08-09). Wiring the updater in
  // unconditionally gave a blank screen on an installed home-screen web app —
  // reproducibly, on relaunch — while the same bundle rendered correctly in
  // Chromium, in headless WebKit and in Safari on the same simulator. It is
  // behind `?autoupdate=1` so it can be reproduced on a webclip installed at
  // that URL without any ordinary install running it. An app that shows
  // nothing is very much worse than one that is out of date.
  useEffect(() => {
    if (typeof location === 'undefined') return;
    if (new URLSearchParams(location.search).get('autoupdate') !== '1') return;
    return watchForUpdate(() => engineRef.current.toSnapshot().dirty.length);
  }, []);

  // Keep the watch feed's view of the partner current, and push again when it
  // changes: their calendars are what the widget's picker offers, so a
  // partner sharing a new calendar has to reach the phone's widget without
  // waiting for one of my own records to change.
  useEffect(() => {
    sharedForWatch.current =
      sharedPartner && sharedRecs.length > 0
        ? { recs: sharedRecs, partner: sharedPartnerLabel ?? sharedPartner }
        : null;
    pushWatchList(engineRef.current.all(), sharedForWatch.current);
  }, [sharedRecs, sharedPartner, sharedPartnerLabel]);

  return (
    <Ctx.Provider value={{ ready, session, recs, syncState, persistFailed, refusedLabels, signIn, signOut, setSession, mutate, syncNow, undoLastDelete, partners, sharedPartner, sharedPartnerLabel, sharedRecs, sharedPut }}>
      {children}
    </Ctx.Provider>
  );
}
