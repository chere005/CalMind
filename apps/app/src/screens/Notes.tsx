/**
 * Notes: folder blocks with gold sections, a note row opens the editor — title
 * plus a plain-text body autosaving on the store's debounce. Notes never
 * convert out and never repeat; a date in the title puts one on the calendar.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { defaultNoteTitle, looksLikeDefaultNoteTitle, deleteSection, renameSection, sectionNameTaken, byRecOrd, richLines, scaleRecipeBody, duplicateItem, prefsPut, moveNote, moveSection, moveSectionEmptyingFolder, newId, nowStr, ordBetween, parseDateField, parseWhenFromText, todayStr, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { useNav } from '../nav';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { FolderPick, useFolderView } from '../components/FolderPick';
import { CircleBtn, CollapseAllBtn, ConfirmDelete, Field, Pill, WebHitSlop } from '../ui';
import { Dropdown } from '../components/Dropdown';
import { useRowDrag } from '../components/rowdrag';
import { useSectionDrag, type SectionSlot } from '../components/sectiondrag';
import { useSwipeLeft } from '../components/swiperow';
import { Chevron } from '../components/Chevron';
import { SyncDot, syncWord } from '../components/SyncDot';
import { EditExit } from '../components/EditExit';
import { RecipeEditor } from './RecipeEditor';

// Half, as written, and double — the three a cook actually asks for.
// The id stays ASCII: it reaches native as an accessibility identifier, and
// adb/XCUITest are no place to be matching on '½'.
const SCALES: [number, string, string][] = [[0.5, '½×', 'half'], [1, '1×', 'one'], [2, '2×', 'double']];

/**
 * State that belongs to whichever note is open, and lets go by itself.
 *
 * Three real bugs tonight were one shape: something the screen remembered
 * about the note you just left. A half-typed draft shown as the next note's
 * body, an armed delete turning the next note's two-press delete into one
 * press, a text selection measured in a body that is no longer on screen.
 * Each was safe alone and dangerous the moment you moved between notes, which
 * is simply how anyone reads a recipe collection.
 *
 * Resetting them in an effect works and has to be remembered every time a new
 * piece of state is added — and being remembered every time is exactly what
 * this failed at. Declared through here instead, state resets during the
 * render in which the note changes, so the wrong value is never shown even
 * once, and the next person gets it for free.
 */
function useNoteScoped<T>(noteId: string | null, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [seen, setSeen] = useState(noteId);
  if (seen !== noteId) {
    setSeen(noteId);
    setValue(initial);
  }
  return [value, setValue];
}

export function Notes({ openNoteId, onOpenConsumed }: { openNoteId?: string | null; onOpenConsumed?: () => void }) {
  const { recs, mutate, sharedRecs, sharedPartnerLabel, syncState, persistFailed } = useStore();
  const nav = useNav();
  const { view, visible: visibleFolders, visibleShared, sharedView, sharedPartner } = useFolderView('notes');
  const setNotePrefs = (lastView: string) => mutate((e) => e.put(prefsPut(recs, 'notes', { lastView })));
  const [openId, setOpenId] = useState<string | null>(null);
  const [sel, setSel] = useNoteScoped(openId, { start: 0, end: 0 });
  const [dateOpen, setDateOpen] = useNoteScoped(openId, false);
  const [bodyEditing, setBodyEditing] = useNoteScoped(openId, false);
  // While the cursor is in the body, the field holds its own copy of the text.
  // The record still gets every keystroke — this only stops the 30s poll from
  // pulling a newer version from another device out from under a half-typed
  // sentence. Reading stale text for as long as you are typing is the same
  // bargain every editor makes; losing the sentence is not.
  const [draft, setDraft] = useNoteScoped<string | null>(openId, null);
  // The title has no edit mode — it is always a live field — so it needs the
  // same shelter, scoped to having focus rather than to a mode.
  const [titleDraft, setTitleDraft] = useNoteScoped<string | null>(openId, null);
  // Doubling a recipe is a way of READING it, not an edit — nothing is
  // written, and 1× is always one tap away.
  const [scale, setScale] = useNoteScoped(openId, 1);
  const [recipeOpen, setRecipeOpen] = useNoteScoped(openId, false);

  const swipe = useSwipeLeft();
  // The suite's page edit mode: long-press a row to enter, tap away or
  // Escape to leave; grips and row controls exist only inside it.
  const [pageEdit, setPageEdit] = useState(false);
  /** Which note the mini date editor is open for, or null. */
  const [dateFor, setDateFor] = useState<string | null>(null);
  /** What is being TYPED in that sheet, before it parses into a real date. */
  const [dateDraft, setDateDraft] = useState('');
  /**
   * Was this editor reached from another TAB (the calendar's day panel, the
   * Add sheet) rather than from the notes list?
   *
   * Sean: the editor's back should return to where you came from. "← All
   * notes" always went to the list, so opening a note from the calendar and
   * pressing back left you in Notes — one tab away from what you were doing.
   */
  const cameFromTab = useRef(false);
  const [nfolded, setNFolded] = useState<Set<string>>(new Set());
  const [foldedFolders, setFoldedFolders] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem('calmind.foldedFolders.notes')
      .then((raw) => raw && setFoldedFolders(new Set(JSON.parse(raw))))
      // Corrupt fold state is a cosmetic loss; unguarded it was an unhandled
      // rejection as well, which is a cosmetic loss that shouts.
      .catch(() => {});
  }, []);
  const toggleFolderFold = (id: string) => {
    const next = new Set(foldedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFoldedFolders(next);
    // Swallowed deliberately, and this is the triage: what is lost when a
    // fold write fails is which sections were collapsed, next launch. No
    // user content, nothing unrecoverable, and an alert about a collapsed
    // folder would be worse than the loss. The failures worth surfacing in
    // this app are the ones that lose DATA or lie about state — see
    // store.tsx's persistFailed and the shared-write reconcile.
    AsyncStorage.setItem('calmind.foldedFolders.notes', JSON.stringify([...next])).catch(() => {});
  };
  useEffect(() => {
    AsyncStorage.getItem('calmind.folded.notes')
      .then((raw) => raw && setNFolded(new Set(JSON.parse(raw))))
      .catch(() => {});
  }, []);
  const foldSave = (next: Set<string>) => {
    setNFolded(next);
    AsyncStorage.setItem('calmind.folded.notes', JSON.stringify([...next])).catch(() => {});
  };
  const toggleNFold = (id: string) => {
    const next = new Set(nfolded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    foldSave(next);
  };
  useEffect(() => {
    if (!pageEdit || typeof document === 'undefined') return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setPageEdit(false); };
    // Capture phase: a focused field can swallow Escape before it bubbles.
    document.addEventListener('keydown', onKey, true);
    // The suite's rule, the same one Reminders uses: a tap leaves edit mode
    // unless it lands on the thing you are editing or an edit control. Notes
    // had the identical gap and I fixed only Reminders first — same two ways
    // out, Escape and an invisible strip at the bottom of the scroll content,
    // neither of which exists on a phone.
    // What may swallow a click and still MEAN "stay in edit mode".
    //
    // This was once just role/input/textarea, on the belief that every row and
    // button is a react-native-web Pressable and those do not propagate their
    // click to document. That belief was WRONG: RNW only sets role="button"
    // when accessibilityRole is given, and a plain <Pressable> — which is what
    // a row is — renders a bare <div> whose click bubbles all the way up. So
    // the rule was closing edit mode on the very long-press that opened it,
    // and the Notes spec caught it the moment the collapse-all stopped being
    // the first thing in the row.
    //
    // Named prefixes, not a whole screen's: '[data-testid^="cal-"]' was tried
    // and it kept the day's own TITLE, which is a label and must exit.
    const KEEP = [
      '[role="button"]', 'input', 'textarea', 'select',
      '[data-testid^="note-"]', '[data-testid^="nsec-"]', '[data-testid^="sec"]',
      '[data-testid^="fold"]', '[data-testid^="pick-"]', '[data-testid^="tab-"]',
    ].join(',');
    // The click that BELONGS to the gesture that opened edit mode must not
    // also close it. A long-press flips pageEdit at ~480ms, the grips appear,
    // the row shifts under the cursor, and the mouseup that follows lands on
    // whatever is now beneath it — a bare container with no testid, which no
    // allow-list can recognise. So edit mode opened and shut in one press.
    //
    // The suite guards the same thing the same way (`suppressClick`). The
    // rule here is exact rather than a timeout: this listener is attached
    // MID-PRESS, so the opening gesture's pointerdown already happened and
    // its trailing click is the one click that arrives without a pointerdown
    // of its own. Anything a person taps afterwards begins with a pointerdown,
    // which clears the flag. A time window was tried first and swallowed
    // deliberate taps that came too soon after — it made the tests red, which
    // is the tests doing their job.
    let ownClick = true;
    const onDown = () => { ownClick = false; };
    document.addEventListener('pointerdown', onDown, true);
    const onClick = (ev: Event) => {
      if (ownClick) { ownClick = false; return; }
      const t = ev.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest(KEEP)) return;
      setPageEdit(false);
    };
    // BUBBLE, deliberately, though habits needs capture for the same job.
    //
    // Capture was tried here and reverted the same hour: it makes MORE clicks
    // reach this listener — every one react-native-web was stopping at a
    // Pressable — and on this screen that closes the inline editor mid-edit.
    // Two repeat-editor specs went red immediately. Habits has no inline
    // editing and a grid of Pressables that swallowed the taps meant to
    // leave, which is why the same change is right there and wrong here.
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [pageEdit]);
  const [dateField, setDateField] = useNoteScoped(openId, '');
  const [delArmed, setDelArmed] = useNoteScoped(openId, false);

  // A note we JUST made should open ready to type, not just open. The scoped
  // states reset on the render where openId changes, so setting bodyEditing
  // in the create handler would be wiped — this effect runs after that reset
  // and wins. The ref names the one note this applies to: opening an existing
  // note stays read-first.
  const freshEdit = React.useRef<string | null>(null);
  // autoFocus on a TextInput that mounts mid-transition is unreliable on iOS
  // — the field appears, the caret does not, and the keyboard never rises.
  // Focusing through a ref on the next tick is the version that actually
  // fires on a device; on web it is a harmless no-op over autoFocus.
  const bodyRef = React.useRef<TextInput | null>(null);
  const titleRef = React.useRef<TextInput | null>(null);
  React.useEffect(() => {
    if (openId && freshEdit.current === openId) {
      freshEdit.current = null;
      // The caret goes to the BODY. Sean said '+ should go directly to
      // editing the new note' twice, and the default title exists so the note
      // is not blank in the list — his words about selection were
      // conditional ('IF you focus the input field'), describing what a TAP
      // on the title does, not asking for the caret to start there. Putting
      // it in the title made you dismiss a keyboard to write anything.
      // The field does not exist until this has rendered, so the focus call
      // waits a tick rather than racing the mount.
      setBodyEditing(true);
      setTimeout(() => bodyRef.current?.focus(), 50);
    }
  }, [openId, setBodyEditing]);
  // Another screen (the Add tab) created a note — land in its editor, as prod does.
  React.useEffect(() => {
    if (openNoteId) {
      freshEdit.current = openNoteId;
      cameFromTab.current = true;
      setOpenId(openNoteId);
      onOpenConsumed?.();
    }
  }, [openNoteId, onOpenConsumed]);
  const [addingSection, setAddingSection] = useState<string | null>(null); // folderId
  const [newSecName, setNewSecName] = useState('');

  const { folders, sectionsOf, notesOf } = useMemo(() => {
    const folders = visibleFolders;
    const sections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
    const notes = recs.filter((r): r is Rec<'note'> => r.type === 'note').sort(byRecOrd);
    return {
      folders,
      sectionsOf: (fid: string) => sections.filter((x) => x.payload.folderId === fid),
      notesOf: (sid: string) => notes.filter((x) => x.payload.sectionId === sid),
    };
  }, [recs, visibleFolders]);

  /** Every section, so the button can both act and show which way it points. */
  const mySectionIds = folders.flatMap((f) => sectionsOf(f.id).map((x) => x.id));
  // …and the partner's, when their blocks are actually on screen. Sean asked
  // for this after the shared folds landed: a collapse-all that skipped them
  // left the button claiming "all collapsed" over sections that were still
  // open. Only under the All view with a partner, because that is the only
  // place those blocks render — counting sections that are not drawn would
  // make the arrow point the wrong way for a reason nobody could see.
  const sharedSectionIds =
    view === 'all' && sharedPartner
      ? visibleShared.flatMap((f) =>
          sharedRecs
            .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
            .map((x) => `sh:${x.id}`),
        )
      : [];
  const allSectionIds = [...mySectionIds, ...sharedSectionIds];
  const allCollapsed = allSectionIds.length > 0 && allSectionIds.every((id) => nfolded.has(id));
  const collapseAllNotes = () => {
    foldSave(allCollapsed ? new Set<string>() : new Set(allSectionIds));
  };

  // Every visible row in render order, plus a placeholder per empty section
  // so an empty section is a drop target (row-height only while dragging).
  type FlatEntry = { kind: 'row'; rec: Rec<'note'>; sectionId: string } | { kind: 'empty'; sectionId: string };
  const flatRows = useMemo(() => {
    const out: FlatEntry[] = [];
    for (const f of folders) {
      for (const sec of sectionsOf(f.id)) {
        const rows = notesOf(sec.id);
        if (rows.length === 0) out.push({ kind: 'empty', sectionId: sec.id });
        for (const n of rows) out.push({ kind: 'row', rec: n, sectionId: sec.id });
      }
    }
    return out;
  }, [folders, sectionsOf, notesOf]);
  const drag = useRowDrag(flatRows.length, (from, to) => {
    const src = flatRows[from];
    if (src?.kind !== 'row') return;
    const slotIdx = to > from ? to + 1 : to;
    const before = flatRows[slotIdx];
    const destSectionId = before?.sectionId ?? flatRows[flatRows.length - 1]?.sectionId ?? src.sectionId;
    const beforeId = before?.kind === 'row' ? before.rec.id : null;
    const res = moveNote(recs, src.rec.id, destSectionId, beforeId);
    if ('error' in res) return;
    mutate((e) => res.put.forEach((r) => e.put(r)));
  });
  const flatIdxOf = (id: string) => flatRows.findIndex((x) => x.kind === 'row' && x.rec.id === id);
  const emptyIdxOf = (sectionId: string) => flatRows.findIndex((x) => x.kind === 'empty' && x.sectionId === sectionId);

  const [emptyAsk, setEmptyAsk] = useState<{ sectionId: string; slot: SectionSlot } | null>(null);
  const [renamingSec, setRenamingSec] = useState<string | null>(null);
  const [renameSecText, setRenameSecText] = useState('');
  const lastSecTap = React.useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const secDrag = useSectionDrag((sectionId, slot) => {
    const res = moveSection(recs, sectionId, slot.folderId, slot.beforeSectionId);
    if (!('error' in res)) {
      mutate((e) => res.put.forEach((r) => e.put(r)));
      return;
    }
    if (res.error === 'a folder keeps its last section') setEmptyAsk({ sectionId, slot });
  });

  const open = openId ? (recs.find((r) => r.id === openId) as Rec<'note'> | undefined) : undefined;
  // Only OUR bodies scale — the markers are what say the ingredients have
  // been read and separated from the prose around them.
  const isRecipe = open ? /^\*\*Ingredients\*\*$/im.test(open.payload.body) : false;
  const shownBody = open ? (scale === 1 ? open.payload.body : scaleRecipeBody(open.payload.body, scale)) : '';

  const goesChoices = useMemo(() => {
    const allFolders = recs
      .filter((r): r is Rec<'folder'> => r.type === 'folder' && (r.payload.app ?? 'reminders') === 'notes')
      .sort(byRecOrd);
    const allSections = recs.filter((r): r is Rec<'section'> => r.type === 'section').sort(byRecOrd);
    return allFolders.flatMap((f) =>
      allSections.filter((x) => x.payload.folderId === f.id).map((x) => ({ sec: x, label: `${f.payload.name} · ${x.payload.name}` })),
    );
  }, [recs]);
  const noteFolderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of goesChoices) {
      const fid = c.sec.payload.folderId;
      if (!seen.has(fid)) seen.set(fid, c.label.split(' · ')[0]!);
    }
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [goesChoices]);

  // The suite carries the folder-head + in Notes as well as Reminders, always
  // shown rather than hidden in edit mode. Without it there was NO way to make
  // a note section at all: normalize seeds one per folder and that was that.
  const addSection = (folder: Rec<'folder'>) => {
    const name = newSecName.trim();
    setAddingSection(null);
    setNewSecName('');
    if (!name) return;
    const secs = sectionsOf(folder.id);
    if (sectionNameTaken(recs, folder.id, name)) return;
    mutate((e) => {
      // Prepend, as on the web: a new section lands at the top of its folder.
      e.put({
        id: newId(),
        type: 'section',
        updated: 0,
        payload: { name, folderId: folder.id, ord: ordBetween(null, secs[0]?.payload.ord ?? null) },
      });
    });
  };

  /**
   * + makes the note and opens it, with nothing in between.
   *
   * This used to drop an inline 'New note' field into the list and make you
   * name the note before anything opened — which is what Sean kept reporting
   * as '+ does not go straight to the new note'. The step itself was the bug,
   * not what happened after it, and my repro passed for weeks because it
   * tested the step instead of questioning it.
   *
   * The name is typed in the editor's own title field now, so the date-in-the-
   * name feature moved to that field's blur (see note-title) rather than being
   * lost with the inline one.
   */
  const addNote = (section: Rec<'section'>) => {
    const id = newId();
    mutate((e) => {
      const first = notesOf(section.id)[0];
      e.put({
        id, type: 'note', updated: 0,
        payload: { title: defaultNoteTitle(), body: '', date: null, folderId: section.payload.folderId, sectionId: section.id, ord: ordBetween(null, first?.payload.ord ?? null) },
      });
    });
    freshEdit.current = id;
    setOpenId(id);
  };

  const wrapSel = (before: string, after = before) => {
    if (!open) return;
    const b = open.payload.body;
    const { start, end } = sel;
    const next = b.slice(0, start) + before + b.slice(start, end) + after + b.slice(end);
    mutate((e) => e.put({ ...open, payload: { ...open.payload, body: next } }));
  };
  const linePrefix = (marker: string) => {
    if (!open) return;
    const b = open.payload.body;
    const at = b.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
    const next = b.slice(0, at) + marker + b.slice(at);
    mutate((e) => e.put({ ...open, payload: { ...open.payload, body: next } }));
  };

  if (sharedView && sharedPartner) {
    return <SharedNotes viewKey={sharedView} partner={sharedPartner} />;
  }

  if (open) {
    return (
      <View style={s.page}>
        <View style={s.edHead}>
          {/* A real BACK, not a link to one destination. Arriving from the
              calendar's day panel and pressing this returns to the calendar;
              arriving from the list returns to the list. It said "← All
              notes" and always meant it, which is why coming from the
              calendar left you a tab away from what you were doing. */}
          <Pressable
            testID="note-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={s.ddPill}
            onPress={() => {
              const external = cameFromTab.current;
              cameFromTab.current = false;
              setOpenId(null);
              if (external) nav.goBack();
            }}
          >
            <Text style={s.backText}>{'‹  Back'}</Text>
          </Pressable>
          {/* And a direct way to the list, beside it. Back returns to wherever
              you came from — which, arriving from the calendar, is the
              calendar — so the one destination it no longer guarantees is the
              one this button is for. Sean asked for both. */}
          <Pressable
            testID="note-all"
            accessibilityRole="button"
            accessibilityLabel="All notes"
            style={s.ddPill}
            onPress={() => { cameFromTab.current = false; setOpenId(null); }}
          >
            <Text style={s.backText}>All notes</Text>
          </Pressable>
          <Dropdown
            value={open.payload.folderId}
            options={noteFolderOptions}
            onPick={(fid) => {
              const firstSec = goesChoices.find((c) => c.sec.payload.folderId === fid)?.sec;
              if (firstSec) mutate((e) => e.put({ ...open, payload: { ...open.payload, folderId: fid, sectionId: firstSec.id } }));
            }}
          />
          <Dropdown
            value={open.payload.sectionId}
            options={goesChoices.filter((c) => c.sec.payload.folderId === open.payload.folderId).map((c) => ({ id: c.sec.id, label: c.sec.payload.name }))}
            onPick={(sid) => {
              const sec = goesChoices.find((c) => c.sec.id === sid)?.sec;
              if (sec) mutate((e) => e.put({ ...open, payload: { ...open.payload, folderId: sec.payload.folderId, sectionId: sec.id } }));
            }}
            gold
          />
        </View>
        {/* Sean, 2026-08-11: a status indicator in the editor's top right.
            This is the one screen where it earns its place — a note is the
            only record that can be REFUSED for being too long, and until now
            the editor said nothing about whether what you were typing was
            reaching the server. Same dot as Settings, from the same rule.

            PINNED rather than placed in the header row: that row wraps on a
            phone, and a right-aligned child in a wrapping row drops to the
            second line, which is not the top right of anything. Measured at
            390pt, where it sat 44pt below the back button. */}
        <View style={s.edStatus} pointerEvents="none">
          <SyncDot testID="editor-sync" withText />
        </View>
        <ScrollView contentContainerStyle={s.editor}>
          <View style={s.titleRow}>
            <TextInput
              ref={titleRef}
              testID="note-title"
              style={s.title}
              value={titleDraft ?? open.payload.title}
              placeholder="Title"
              placeholderTextColor={T.muted}
              selectTextOnFocus
              onFocus={() => {
                setTitleDraft(open.payload.title);
                // selectTextOnFocus is a no-op under react-native-web, so the
                // web needs the selection made by hand. Native honours the prop.
                const el = titleRef.current as unknown as { setSelection?: (a: number, b: number) => void } | null;
                el?.setSelection?.(0, open.payload.title.length);
              }}
              onBlur={() => {
                // The inline add field used to do this on the way in. It is
                // the title's job now, so 'Dentist 8/3' still puts the note on
                // the calendar — and now it works when renaming too.
                setTitleDraft(null);
                const raw = open.payload.title.trim();
                // The default title is itself a date; parsing it would put
                // every note nobody renamed onto the calendar.
                if (!raw || open.payload.date || looksLikeDefaultNoteTitle(raw)) return;
                const [title, date] = parseWhenFromText(raw, todayStr(), nowStr());
                if (date) mutate((e) => e.put({ ...open, payload: { ...open.payload, title: title || raw, date } }));
              }}
              onChangeText={(t) => {
                setTitleDraft(t);
                mutate((e) => e.put({ ...open, payload: { ...open.payload, title: t } }));
              }}
            />
            {open.payload.date ? (
              <Pressable style={s.addDate} onPress={() => mutate((e) => e.put({ ...open, payload: { ...open.payload, date: null } }))}>
                <Text style={s.addDateText}>{open.payload.date} ×</Text>
              </Pressable>
            ) : (
              <Pressable style={s.addDate} onPress={() => { setDateOpen(!dateOpen); setDateField(''); }}>
                <Text style={s.addDateText}>+ Add date</Text>
              </Pressable>
            )}
          </View>
          {/* The format pills live under the name, as prod places them. */}
          <View style={s.toolRow}>
            <Pill label={'”'} onPress={() => linePrefix('> ')} />
            <Pill label="B" onPress={() => wrapSel('**')} />
            <Pill label="I" onPress={() => wrapSel('*')} />
            <Pill label="U" onPress={() => wrapSel('__')} />
            <Pill label="· List" onPress={() => linePrefix('- ')} />
            <Pill
              testID="recipe-import"
              label="Recipe"
              onPress={() => {
                // The editor works on what the note SAYS, not on what the
                // scale is showing. Dropping back to 1x first means the two
                // agree on screen, rather than the editor looking like it
                // threw the doubling away.
                setScale(1);
                setRecipeOpen(true);
              }}
            />
          </View>
          {dateOpen && (
            <View style={s.metaRow}>
              <Pill
                label="Today"
                onPress={() => { mutate((e) => e.put({ ...open, payload: { ...open.payload, date: todayStr() } })); setDateOpen(false); }}
              />
              <Field
                value={dateField}
                onChangeText={setDateField}
                placeholder="m/d"
                style={s.dateField}
                onSubmitEditing={() => {
                  const d = parseDateField(dateField, todayStr());
                  if (d) mutate((e) => e.put({ ...open, payload: { ...open.payload, date: d } }));
                  setDateOpen(false);
                }}
              />
            </View>
          )}

          {isRecipe && (
            <View testID="scale-row" style={s.scaleRow}>
              {SCALES.map(([f, label, id]) => (
                <Pressable
                  key={id}
                  testID={`scale-${id}`}
                  style={[s.scalePill, scale === f && s.scalePillOn]}
                  onPress={() => setScale(f)}
                  hitSlop={6}
                >
                  <Text style={[s.scaleText, scale === f && s.scaleTextOn]}>{label}</Text>
                </Pressable>
              ))}
              {scale !== 1 && <Text style={s.scaleNote}>Scaled — 1× to edit</Text>}
            </View>
          )}
          {bodyEditing ? (
            <TextInput
              ref={bodyRef}
              testID="note-body-edit"
              style={s.body}
              value={draft ?? open.payload.body}
              placeholder="Write…"
              placeholderTextColor={T.muted}
              multiline
              // NO autoFocus. It used to grab focus the instant the editor
              // opened, which fought the title focus on a brand-new note:
              // title wins the race, body blurs, and onBlur below collapses
              // the editor straight back to a read view. The body is focused
              // deliberately by whoever opened it (tap-to-edit, just below)
              // rather than by racing.
              onBlur={() => {
                setBodyEditing(false);
                setDraft(null);
              }}
              onSelectionChange={(ev) => setSel(ev.nativeEvent.selection)}
              onChangeText={(t) => {
                setDraft(t);
                mutate((e) => e.put({ ...open, payload: { ...open.payload, body: t } }));
              }}
            />
          ) : (
            <Pressable
              testID="note-body-view"
              style={s.body}
              onPress={() => {
                // At 2× the text on screen is not the text in the note, so
                // tapping must not drop you into an editor showing something
                // else. 1× is right there.
                if (scale !== 1) return;
                setDraft(open.payload.body);
                setBodyEditing(true);
                // The field does not exist until this has rendered.
                setTimeout(() => bodyRef.current?.focus(), 50);
              }}
            >
              {shownBody === '' ? (
                <Text style={s.bodyPlaceholder}>Write…</Text>
              ) : (
                richLines(shownBody).map((ln, i) => (
                  <View key={i} style={[s.rtLine, ln.kind === 'quote' && s.rtQuote, ln.kind === 'number' && s.rtStep]}>
                    {ln.kind === 'bullet' && <Text style={s.rtDot}>•</Text>}
                    {ln.kind === 'number' && <Text style={s.rtNum}>{ln.num}</Text>}
                    <Text style={[s.rtText, ln.kind === 'quote' && s.rtQuoteText]}>
                      {ln.runs.map((r, j) => (
                        <Text
                          key={j}
                          style={[
                            r.bold && s.rtBold,
                            r.italic && s.rtItalic,
                            r.under && s.rtUnder,
                          ]}
                        >
                          {r.text || (ln.runs.length === 1 ? ' ' : '')}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))
              )}
            </Pressable>
          )}

          {recipeOpen && <RecipeEditor note={open} onClose={() => setRecipeOpen(false)} />}
          {/* Saved sits bottom-left; the two-press delete bottom-right.
              It READS THE STATE now. It used to be the literal string 'Saved',
              which is a claim this screen was in no position to make: it said
              so while the device could not write its snapshot, while a note was
              refused for being too long, and while the app was offline — and
              once the editor grew an honest dot in its top right, the two sat
              three inches apart disagreeing. Same word, same rule, one source. */}
          <View style={s.footRow}>
            <Text
              testID="editor-saved"
              style={[s.saved, (persistFailed || syncState === 'refused') && s.savedBad]}
            >
              {syncWord(syncState, persistFailed)}
            </Text>
            <Pressable
              onPress={() => {
                if (delArmed) { setOpenId(null); mutate((e) => e.del(open.id)); setDelArmed(false); }
                else { setDelArmed(true); setTimeout(() => setDelArmed(false), 2500); }
              }}
            >
              <Text style={[s.delText, delArmed && s.delArmed]}>Delete</Text>
            </Pressable>
          </View>
        </ScrollView>

      </View>
    );
  }

  return (
    <View style={s.page}>
      {/* Right of the name, as in Reminders and as Sean asked. */}
      <TopBar
        title="Notes"
        controls={<CollapseAllBtn open={!allCollapsed} onPress={collapseAllNotes} />}
        picker={<FolderPick app="notes" />}
      />
      {/* A live drag holds the scroll still — see Habits for the why. */}
      <ScrollView contentContainerStyle={s.scroll} scrollEnabled={drag.dragIdx === null && secDrag.dragging === null}>
        {/* The phone's tap-to-exit; the web keeps its document listener. */}
        <EditExit active={pageEdit} onExit={() => setPageEdit(false)}>
        {folders.map((f) => (
          <View key={f.id} style={s.folderBlock}>
            {/* The header ROW is the reliable way out: always on screen, full
                width, and taller than the 1pt rule. With Done gone, tapping
                out is the ONLY exit, so it must not depend on blank space
                below a list that fills the screen. The controls inside keep
                their own presses — this fires on the row's bare surface. */}
            <View testID={`head-fold-${f.payload.name}`} style={s.folderHead}>
              <Pressable onPress={() => toggleFolderFold(f.id)} hitSlop={8} style={s.chevWrap}>
                <WebHitSlop />
                <Chevron open={!foldedFolders.has(f.id)} color={T.text} />
              </Pressable>
              <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
              <CircleBtn testID={`foldadd-${f.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => { setAddingSection(f.id); setNewSecName(''); }} />
              <View style={s.folderRule} />
            </View>
            {addingSection === f.id && (
              <Field
                value={newSecName}
                onChangeText={setNewSecName}
                placeholder="New section"
                autoFocus
                onBlur={() => addSection(f)}
                onSubmitEditing={() => addSection(f)}
              />
            )}
            {!foldedFolders.has(f.id) && sectionsOf(f.id).map((sec) => (
              <View key={sec.id} style={s.section}>
                {secDrag.lineKey === `before:${sec.id}` && <View style={s.dropLine} />}
                <View
                  testID={`head-sec-${sec.payload.name}`}
                  ref={secDrag.registerHeader(sec.id, f.id)}
                  style={[s.secHead, secDrag.dragging === sec.id && { opacity: 0.55 }]}
                >
                  <View testID={`nsec-grip-${sec.payload.name}`} {...(pageEdit ? secDrag.gripFor(sec.id) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                    <WebHitSlop slop={6} />
                    <Text style={s.rowGripText}>≡</Text>
                  </View>
                  <Pressable testID={`secfold-${sec.payload.name}`} onPress={() => toggleNFold(sec.id)} hitSlop={8} style={s.chevWrap}>
                    <WebHitSlop />
                    <Chevron open={!nfolded.has(sec.id)} />
                  </Pressable>
                  {renamingSec === sec.id ? (
                    <Field
                      testID="nsec-rename"
                      value={renameSecText}
                      onChangeText={setRenameSecText}
                      autoFocus
                      style={s.secRename}
                      onBlur={() => {
                        setRenamingSec(null);
                        const res = renameSection(recs, sec.id, renameSecText);
                        if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                      }}
                      onSubmitEditing={() => {
                        setRenamingSec(null);
                        const res = renameSection(recs, sec.id, renameSecText);
                        if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                      }}
                    />
                  ) : (
                    <Pressable
                      testID={`nsec-name-${sec.payload.name}`}
                      onPress={() => {
                        const now = Date.now();
                        if (lastSecTap.current.id === sec.id && now - lastSecTap.current.at < 300) {
                          setPageEdit(true);
                          setRenamingSec(sec.id);
                          setRenameSecText(sec.payload.name);
                        }
                        lastSecTap.current = { id: sec.id, at: now };
                      }}
                      onLongPress={() => { setPageEdit(true); setRenamingSec(sec.id); setRenameSecText(sec.payload.name); }}
                      delayLongPress={350}
                    >
                      <Text style={s.secName}>{sec.payload.name}</Text>
                    </Pressable>
                  )}
                  <CircleBtn testID={`secadd-${sec.payload.name}`} glyph="+" label="Add" color={T.accent} size={22} onPress={() => addNote(sec)} />
                  {/* No × on a folder's ONLY section, exactly as the suite
                      does it: "No × on a folder's only section — its last
                      section can't be deleted." core's deleteSection refuses
                      it, and both screens swallowed that refusal, so the
                      button was offered and did nothing — in the state every
                      folder STARTS in, since normalize seeds each with one
                      section. The two-press × then answered a confirmed
                      delete with silence. */}
                  {pageEdit && sectionsOf(f.id).length > 1 && (
                    <ConfirmDelete testID={`nsecdel-${sec.payload.name}`} size={22} onDelete={() => {
                      const res = deleteSection(recs, sec.id);
                      if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                    }} />
                  )}
                </View>
                {!nfolded.has(sec.id) && notesOf(sec.id).length === 0 && (
                  <View>
                    {drag.slot !== null && emptyIdxOf(sec.id) === drag.slot && <View style={s.dropLine} />}
                    <View testID={`nsecempty-${sec.payload.name}`} ref={drag.registerRow(emptyIdxOf(sec.id))} style={s.emptySlot}>
                    </View>
                  </View>
                )}
                {!nfolded.has(sec.id) && notesOf(sec.id).map((n) => (
                  <View key={n.id}>
                    {drag.slot !== null && flatIdxOf(n.id) === drag.slot && <View style={s.dropLine} />}
                    <View ref={drag.registerRow(flatIdxOf(n.id))} {...(pageEdit ? {} : swipe.handlersFor(n.id))} style={[s.row, s.rowNoSelect, drag.dragIdx !== null && flatIdxOf(n.id) === drag.dragIdx && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}>
                      <View testID="note-grip" {...(pageEdit ? drag.handleFor(flatIdxOf(n.id)) : {})} style={[s.rowGrip, !pageEdit && s.gripHidden]} pointerEvents={pageEdit ? 'auto' : 'none'} hitSlop={6}>
                    <WebHitSlop slop={6} />
                        <Text style={s.rowGripText}>≡</Text>
                      </View>
                      <Pressable
                        testID="note-row"
                        onPress={() => { if (swipe.justSwiped()) return; if (swipe.swiped) { swipe.clear(); return; } setOpenId(n.id); }}
                        onLongPress={() => setPageEdit(true)}
                        delayLongPress={350}
                        style={s.rowBody}
                      >
                        <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                        {/* The chevron means "tap to open". While a delete is
                            armed — swiped, or the whole page in edit mode —
                            that is not what a tap does, so it goes away
                            rather than sitting next to the X contradicting it. */}
                        {!(pageEdit || swipe.swiped === n.id) && <Text style={s.chev}>›</Text>}
                      </Pressable>
                      {/* The date itself is the other way in: Sean asked that
                          tapping a date in edit mode open the same editor. */}
                      {pageEdit && n.payload.date && (
                        <Pressable testID={`note-datechip-${n.payload.title}`} onPress={() => { setDateDraft(n.payload.date ?? ''); setDateFor(n.id); }} hitSlop={6}>
                          <WebHitSlop slop={6} />
                          <Text style={s.dateChip}>{n.payload.date}</Text>
                        </Pressable>
                      )}
                      {pageEdit && (
                        <>
                          {/* A date without opening the note — Sean's. Beside
                              duplicate, and it opens the same mini editor an
                              existing date chip does. */}
                          <CircleBtn
                            testID={`note-date-${n.payload.title}`}
                            glyph="📅"
                            label={n.payload.date ? 'Change date' : 'Add a date'}
                            size={22}
                            color={n.payload.date ? T.accent : T.dim}
                            onPress={() => { setDateDraft(n.payload.date ?? ''); setDateFor(n.id); }}
                          />
                          <CircleBtn testID="note-dup" glyph="⧉" label="Duplicate" size={22} onPress={() => {
                            const res = duplicateItem(recs, n.id, newId);
                            if (!('error' in res)) mutate((e) => res.put.forEach((p) => e.put(p)));
                          }} />
                          <ConfirmDelete onDelete={() => mutate((e) => e.del(n.id))} />
                        </>
                      )}
                      {swipe.swiped === n.id && !pageEdit && (
                        <ConfirmDelete forceArmed onDelete={() => { swipe.clear(); mutate((e) => e.del(n.id)); }} />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {secDrag.lineKey === `end:${f.id}` && <View style={s.dropLine} />}
          </View>
        ))}
        {view === 'all' && sharedPartner &&
          visibleShared
            .slice()
            .sort(byRecOrd)
            .map((f) => (
              <View key={`sh${f.id}`} style={s.folderBlock}>
                {/* Collapsible like my own, and the fold is MINE — device-local
                    AsyncStorage, never written to their store, never synced.
                    Folding their list away changes nothing on their screen. */}
                <Pressable style={s.folderHead} onPress={() => toggleFolderFold(`sh:${f.id}`)} hitSlop={8}>
                  <View style={s.chevWrap}><WebHitSlop /><Chevron open={!foldedFolders.has(`sh:${f.id}`)} color={T.text} /></View>
                  <Text style={[s.folderName, { backgroundColor: f.payload.color + '33' }]}>{f.payload.name}</Text>
                  {/* Beside the name, LEFT of the divider. It used to sit
                      between two rule segments, which read as a label on the
                      line rather than on the folder. */}
                  <Text testID="shared-owner-badge" style={s.ownerBadge}>{sharedPartnerLabel}</Text>
                  <View testID="shared-folder-rule" style={s.folderRule} />
                </Pressable>
                {!foldedFolders.has(`sh:${f.id}`) && sharedRecs
                  .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === f.id)
                  .sort(byRecOrd)
                  .map((sec) => (
                    <View key={sec.id} style={s.section}>
                      {/* A partner's section collapses like my own. The
                          folder above it already did; the sections inside it
                          did not, so the only way to put one away was to put
                          the whole partner away. Keyed 'sh:' so a shared
                          section id can never collide with one of mine, and
                          the fold is MINE — device-local, never written to
                          their store, never synced. */}
                      <Pressable testID={`shared-secfold-${sec.payload.name}`} style={[s.secHead, s.sharedSecHead]} onPress={() => toggleNFold(`sh:${sec.id}`)} hitSlop={8}>
                        <View style={s.chevWrap}><WebHitSlop /><Chevron open={!nfolded.has(`sh:${sec.id}`)} /></View>
                        <Text style={s.secName}>{sec.payload.name}</Text>
                      </Pressable>
                      {!nfolded.has(`sh:${sec.id}`) && sharedRecs
                        .filter((r): r is Rec<'note'> => r.type === 'note' && r.payload.sectionId === sec.id)
                        .sort(byRecOrd)
                        .map((n) => (
                          <View key={n.id} style={[s.row, s.sharedRow]}>
                            <Pressable
                              testID="all-shared-note"
                              onPress={() => setNotePrefs(`@${sharedPartner}:${f.id}`)}
                              style={s.rowBody}
                            >
                              <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                              <Text style={s.chev}>›</Text>
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  ))}
              </View>
            ))}
        {pageEdit && <Pressable style={s.editBackdropFill} onPress={() => setPageEdit(false)} />}
        </EditExit>
      </ScrollView>
      {/* The mini date/time editor: exactly the three controls Sean named —
          remove the date, set it to today, done. Nothing else, because a
          fourth control here is a second date picker nobody asked for and
          the note editor already has the full one. */}
      {dateFor && (() => {
        const note = recs.find((x): x is Rec<'note'> => x.type === 'note' && x.id === dateFor && !x.deleted);
        if (!note) return null;
        const setDate = (date: string | null) =>
          mutate((e) => e.put({ ...note, payload: { ...note.payload, date } }));
        return (
          <Modal transparent animationType="fade" onRequestClose={() => setDateFor(null)}>
            <Pressable style={s.dateBackdrop} onPress={() => setDateFor(null)}>
              <Pressable style={s.dateCard} onPress={() => {}}>
                <Text style={s.dateTitle} numberOfLines={1}>{note.payload.title}</Text>
                {/* PARSED, not stored raw. This wrote whatever was typed
                    straight into payload.date, so "8/12" was stored as
                    "8/12" — and every date comparison in the app is against
                    YYYY-MM-DD, so the note simply never appeared on the day
                    it said. The note editor's own field has always gone
                    through parseDateField; this is the same function, so the
                    two cannot disagree about what "8/12" means.

                    Committed on SUBMIT rather than on every keystroke: parsing
                    a half-typed "8/" and writing the result back into the
                    field fights the person typing it. */}
                <Field
                  testID="note-date-field"
                  value={dateDraft}
                  onChangeText={setDateDraft}
                  placeholder="m/d or 2026-08-12"
                  style={s.dateMiniField}
                  onSubmitEditing={() => {
                    const d = parseDateField(dateDraft, todayStr());
                    if (d) setDate(d);
                  }}
                  onBlur={() => {
                    const d = parseDateField(dateDraft, todayStr());
                    if (d) setDate(d);
                  }}
                />
                <View style={s.dateRow}>
                  <CircleBtn
                    testID="note-date-clear"
                    glyph="×"
                    label="Remove the date"
                    size={36}
                    onPress={() => { setDate(null); setDateDraft(''); setDateFor(null); }}
                  />
                  <CircleBtn
                    testID="note-date-today"
                    glyph="◉"
                    label="Today"
                    size={36}
                    color={T.gold}
                    onPress={() => { setDate(todayStr()); setDateDraft(todayStr()); }}
                  />
                  <CircleBtn
                    testID="note-date-done"
                    glyph="✓"
                    label="Done"
                    size={36}
                    color={T.accent}
                    active
                    onPress={() => setDateFor(null)}
                  />
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}
      {emptyAsk && (
        <Modal transparent animationType="fade" onRequestClose={() => setEmptyAsk(null)}>
          <Pressable style={s.askBackdrop} onPress={() => setEmptyAsk(null)}>
            <Pressable style={s.askCard} onPress={() => {}}>
              <Text style={s.askText}>That's the folder's last section — move it and delete the emptied folder?</Text>
              <View style={s.askRow}>
                <Pill label="Cancel" onPress={() => setEmptyAsk(null)} />
                <Pill
                  label="Move & delete"
                  primary
                  onPress={() => {
                    const res = moveSectionEmptyingFolder(recs, emptyAsk.sectionId, emptyAsk.slot.folderId, emptyAsk.slot.beforeSectionId);
                    if (!('error' in res)) mutate((e) => res.put.forEach((r) => e.put(r)));
                    setEmptyAsk(null);
                  }}
                />
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

/**
 * A partner's shared note folder: their sections and rows, read-only — a tap
 * opens the note RENDERED (richLines), never the editor. Structure and body
 * both stay theirs; live shared note editing is a later milestone.
 */
function SharedNotes({ viewKey, partner }: { viewKey: string; partner: string }) {
  const { sharedRecs, sharedPut, sharedPartnerLabel } = useStore();
  const shown = sharedPartnerLabel ?? partner;
  const folderId = viewKey.slice(viewKey.indexOf(':') + 1);
  const folder = sharedRecs.find((r): r is Rec<'folder'> => r.type === 'folder' && r.id === folderId);
  const sections = sharedRecs
    .filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === folderId)
    .sort(byRecOrd);
  const notesOf = (sid: string) =>
    sharedRecs
      .filter((r): r is Rec<'note'> => r.type === 'note' && r.payload.sectionId === sid)
      .sort(byRecOrd);
  const [openShared, setOpenShared] = useState<Rec<'note'> | null>(null);
  const [sharedBodyEdit, setSharedBodyEdit] = useNoteScoped(openShared?.id ?? null, false);
  const [draft, setDraft] = useNoteScoped(openShared?.id ?? null, '');
  // A recipe someone shares with you is still a recipe to cook from.
  const [sharedScale, setSharedScale] = useNoteScoped(openShared?.id ?? null, 1);

  if (openShared) {
    const commitBody = () => {
      setSharedBodyEdit(false);
      if (draft !== openShared.payload.body) {
        const next = { ...openShared, payload: { ...openShared.payload, body: draft } };
        setOpenShared(next);
        void sharedPut(next);
      }
    };
    return (
      <View style={s.page}>
        <View style={s.edHead}>
          <Pressable style={s.ddPill} onPress={() => setOpenShared(null)}>
            <Text style={s.backText}>← @{shown}: {folder?.payload.name ?? ''}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.editor}>
          <Text style={s.sharedTitle}>{openShared.payload.title}</Text>
          {openShared.payload.date && <Text style={s.sharedDate}>{openShared.payload.date}</Text>}
          {/^\*\*Ingredients\*\*$/im.test(openShared.payload.body) && (
            <View testID="shared-scale-row" style={s.scaleRow}>
              {SCALES.map(([f, label, id]) => (
                <Pressable
                  key={id}
                  testID={`shared-scale-${id}`}
                  style={[s.scalePill, sharedScale === f && s.scalePillOn]}
                  onPress={() => setSharedScale(f)}
                  hitSlop={6}
                >
                  <Text style={[s.scaleText, sharedScale === f && s.scaleTextOn]}>{label}</Text>
                </Pressable>
              ))}
              {sharedScale !== 1 && <Text style={s.scaleNote}>Scaled — 1× to edit</Text>}
            </View>
          )}
          {sharedBodyEdit ? (
            <TextInput
              testID="shared-note-edit"
              style={s.body}
              value={draft}
              multiline
              autoFocus
              onChangeText={setDraft}
              onBlur={commitBody}
            />
          ) : (
            <Pressable
              testID="shared-note-body"
              style={s.body}
              onPress={() => {
                // Same rule as your own notes: never open an editor on text
                // that is not what the note says.
                if (sharedScale !== 1) return;
                setDraft(openShared.payload.body);
                setSharedBodyEdit(true);
              }}
            >
              {richLines(sharedScale === 1 ? openShared.payload.body : scaleRecipeBody(openShared.payload.body, sharedScale)).map((ln, i) => (
                <View key={i} style={[s.rtLine, ln.kind === 'number' && s.rtStep, ln.kind === 'quote' && s.rtQuote]}>
                  {ln.kind === 'bullet' && <Text style={s.rtDot}>•</Text>}
                  {ln.kind === 'number' && <Text style={s.rtNum}>{ln.num}</Text>}
                  <Text style={[s.rtText, ln.kind === 'quote' && s.rtQuoteText]}>
                    {ln.runs.map((r, j) => (
                      <Text key={j} style={[r.bold && s.rtBold, r.italic && s.rtItalic, r.under && s.rtUnder]}>{r.text || ' '}</Text>
                    ))}
                  </Text>
                </View>
              ))}
            </Pressable>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.page}>
      <TopBar title="Notes" picker={<FolderPick app="notes" />} />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.folderHead}>
          <Text style={s.sharedFolderChip}>@{shown}: {folder?.payload.name ?? '…'}</Text>
        </View>
        {sections.map((sec) => (
          <View key={sec.id} style={s.section}>
            <View style={s.secHead}>
              <Text style={s.secName}>{sec.payload.name}</Text>
            </View>
            {notesOf(sec.id).map((n) => (
              <View key={n.id} style={s.row}>
                <Pressable testID="shared-note-row" onPress={() => setOpenShared(n)} style={s.rowBody}>
                  <Text style={s.rowTitle} numberOfLines={1}>{n.payload.title}</Text>
                  <Text style={s.chev}>›</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  topbar: { height: 32, marginTop: 16, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appname: { color: T.text, fontSize: 18, fontWeight: '700' },
  // flexGrow so the edit backdrop below the list has leftover height to take.
  // 8pt below the divider on every tab. Measured before touching it: 6 on
  // Reminders, 9 on Habits, 11 on Calendar, 16 on Notes. Sean named Habits as
  // closest and a hair tall, so 8 is the target and every screen is tuned to
  // land there rather than to carry the same number in its own style.
  // paddingTop 0 — the gap below the divider is TopBar's now (chrome.tsx).
  // This screen's 8 was the value that MATCHED the suite; it moved rather
  // than changed, and the other four came to it.
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 48, gap: 18, flexGrow: 1 },
  folderBlock: { gap: 8 },
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  folderName: {
    color: T.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    paddingHorizontal: 11,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  // The width a section head is pushed in by the drag grip it carries
  // (16) plus the head's own gap (8). A partner's sections have no grip
  // to push them, so they get the same distance as padding instead.
  sharedSecHead: { paddingLeft: 24 },
  // …and the same for a partner's ROWS, which lack the drag grip mine
  // carry (16) plus the row's gap — 8 here, not the 10 Reminders uses, so
  // this is 24 and not 26. Copying the number across would have been off by
  // two in the one place the whole change is about.
  sharedRow: { paddingLeft: 24 },
  ownerBadge: { color: T.accent, fontSize: 12, fontWeight: '700', backgroundColor: T.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  folderRule: { flex: 1, height: 1, backgroundColor: T.lineSoft },
  section: { gap: 6 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  secRename: { flex: 1, paddingVertical: 4 },
  secName: { color: T.gold, fontSize: 16, lineHeight: 20, fontWeight: '600' },
  chevron: { color: T.dim, fontSize: 16, width: 20, textAlign: 'center' },
  // An explicit HEIGHT, not the glyph's. This box had width 20 and no
  // height, so its height WAS the chevron — and on the web, where
  // hitSlop does nothing, taking the chevron from 11 to 7 would have
  // taken the tap target with it. 20x20 regardless of what is drawn.
  chevWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  // ONE collapse-all across the app: Notes drew it at 24 and Reminders at
  // 26, and Habits drew a text '⌃' in a 30pt CircleBtn instead. Same
  // control, three sizes and two symbols. 26 is the largest of them, and
  // the circle IS the tap target here — the chevron inside is decoration.
  // toolbarRow is GONE. It had been emptied of its controls and left behind as
  // a bare <View> holding nothing, which is not free: it was the scroll's
  // first child, so it contributed its own paddingBottom of 2 AND a full
  // `gap: 18` between itself and the first folder. That is the 28px Sean saw
  // as "the notes gap is huge" — the divider spacing was 8 here, the smallest
  // of the five screens, and this row was hiding above everything.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  // alignSelf STRETCH, not the parent's default 'center'. The row is 44pt and
  // this Pressable is what answers a tap in it; as a centred flex child it
  // collapsed to its one line of text — about 18pt — and the 26pt around it
  // looked exactly like the row while doing nothing, because it IS the row.
  // Its own alignItems:'center' still centres the title inside the taller box.
  rowBody: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNoSelect: { userSelect: 'none' } as import('react-native').ViewStyle,
  sharedTitle: { color: T.text, fontSize: 22, fontWeight: '800' },
  sharedDate: { color: T.dim, fontSize: 13, marginTop: 2 },
  sharedFolderChip: { color: T.text, fontSize: 15, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  gripHidden: { opacity: 0 },
  editBackdropFill: { flexGrow: 1, minHeight: 160 },
  editDone: { marginLeft: 'auto' },
  dateChip: { color: T.gold, fontSize: 12, paddingHorizontal: 6 },
  dateBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dateCard: { width: '100%', maxWidth: 340, backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.line, padding: 16, gap: 12 },
  dateTitle: { color: T.text, fontSize: 15, fontWeight: '600' },
  dateMiniField: { marginTop: 0 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 4 },
  rowGrip: { width: 16, alignItems: 'center', justifyContent: 'center' },
  rowGripText: { color: T.lineSoft, fontSize: 13, userSelect: 'none' },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 1 },
  emptySlot: { height: 0, overflow: 'hidden' },
  askBackdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  askCard: { width: '100%', maxWidth: 360, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 16, padding: 20, gap: 14 },
  askText: { color: T.text, fontSize: 15, lineHeight: 22 },
  askRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  rowTitle: { color: T.text, fontSize: 16, flex: 1 },
  chev: { color: T.muted, fontSize: 16, marginLeft: 'auto' },
  editor: { padding: 16, gap: 10 },
  edHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginHorizontal: 16, marginBottom: 8, flexWrap: 'wrap' },
  // marginLeft auto pushes it to the right edge of the row, and it keeps its
  // corner when the row wraps on a narrow screen rather than following the
  // dropdowns down.
  edStatus: { position: 'absolute', right: 16, top: 20 },
  ddPill: { borderWidth: 1, borderColor: T.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.surface },
  ddPillGold: { borderColor: T.gold },
  backText: { color: T.accent, fontSize: 15, fontWeight: '600' },
  ddText: { color: T.text, fontSize: 15, fontWeight: '600' },
  ddTextGold: { color: T.gold, fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addDate: { borderWidth: 1, borderColor: T.accent, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  addDateText: { color: T.accent, fontSize: 14, fontWeight: '600' },
  delText: { color: T.dim, fontSize: 15, borderWidth: 1, borderColor: T.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, overflow: 'hidden' },
  delArmed: { color: '#fff', backgroundColor: T.danger, borderColor: T.danger },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dateField: { minWidth: 90, paddingVertical: 6 },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  saved: { color: T.muted, fontSize: 12 },
  // The word turns with the state; a grey 'Not saved' would read as furniture.
  savedBad: { color: T.danger, fontWeight: '700' },
  goesMenu: { position: 'absolute', left: 16, right: 16, top: 140, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 14, padding: 12, gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  title: {
    flex: 1,
    color: T.text,
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chip: { color: T.dim, fontSize: 12 },
  ocrBusy: { color: T.dim, fontSize: 13, alignSelf: 'center' },
  bodyPlaceholder: { color: T.muted, fontSize: 16, lineHeight: 24 },
  rtLine: { flexDirection: 'row', alignItems: 'flex-start' },
  rtQuote: { borderLeftWidth: 3, borderLeftColor: '#a78bfa', paddingLeft: 10, marginVertical: 2 },
  rtQuoteText: { color: T.dim, fontStyle: 'italic' },
  rtDot: { color: T.dim, fontSize: 16, lineHeight: 24, marginRight: 8 },
  // The number sits in a gutter so a wrapped step lines up as a block, and
  // the steps get a little air between them — a recipe is read a line at a
  // time, looking up from a pan and back.
  rtNum: { color: T.dim, fontSize: 16, lineHeight: 24, marginRight: 8, minWidth: 20 },
  rtStep: { marginTop: 6 },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  scalePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: T.line },
  scalePillOn: { borderColor: T.accent, backgroundColor: T.accent + '22' },
  scaleText: { color: T.dim, fontSize: 14 },
  scaleTextOn: { color: T.accent, fontWeight: '700' },
  scaleNote: { color: T.muted, fontSize: 12, flexShrink: 1 },
  rtText: { color: T.text, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  rtBold: { fontWeight: '700' },
  rtItalic: { fontStyle: 'italic' },
  rtUnder: { textDecorationLine: 'underline' },
  body: {
    color: T.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 280,
    textAlignVertical: 'top',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 12,
    padding: 12,
  },
}));
