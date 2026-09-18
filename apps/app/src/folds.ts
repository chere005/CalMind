/**
 * One screen's fold state — what is shut, how a tap toggles it, and what a
 * HELD caret does to the whole level.
 *
 * There were six copies of this: Reminders and Notes each keep two levels
 * (folders and sections), Habits its sections, the Calendar its day-panel
 * groups. Every one of them had grown the same three things by hand — a Set
 * in state, a load on mount, and a toggle that rebuilt the Set and wrote it
 * back — and they had already drifted in the places that matter least and
 * confuse most: some swallowed the write, some named the helper `saveFold`,
 * some inlined it. The suite's own lesson, learned on the collapse-all
 * button and the chevron before it: the fourth copy is where a control stops
 * agreeing with itself.
 *
 * The RULE that decides which way a held caret goes lives in core
 * (`foldLevel`), because it is the part worth testing and the part every
 * surface has to agree on. This is the React half: state, persistence, and
 * the three functions a screen actually calls.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { foldLevel } from '@calmind/core';

export type Folds = {
  /** The shut ids, for the reads that want the Set itself. */
  shut: Set<string>;
  /** Is this caret drawn open? */
  isOpen: (id: string) => boolean;
  /** A TAP: this caret only. */
  toggle: (id: string) => void;
  /**
   * A HOLD: every caret at the level. `ids` is the level as it is DRAWN —
   * never rows filtered out of view — and `wasOpen` is the held caret's own
   * state. See core's foldLevel for why the direction is read from there.
   */
  foldAll: (ids: readonly string[], wasOpen: boolean) => void;
};

export function useFolds(storageKey: string): Folds {
  const [shut, setShut] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((raw) => raw && setShut(new Set(JSON.parse(raw) as string[])))
      .catch(() => {});
  }, [storageKey]);
  /**
   * Swallowed deliberately, and this is the triage: what is lost when a fold
   * write fails is which sections were collapsed, next launch. No user
   * content, nothing unrecoverable, and an alert about a collapsed folder
   * would be worse than the loss. The failures worth surfacing in this app
   * are the ones that lose DATA or lie about state — see store.tsx's
   * persistFailed and the shared-write reconcile.
   */
  const save = (next: Set<string>) => {
    setShut(next);
    AsyncStorage.setItem(storageKey, JSON.stringify([...next])).catch(() => {});
  };
  return {
    shut,
    isOpen: (id) => !shut.has(id),
    toggle: (id) => {
      const next = new Set(shut);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(next);
    },
    foldAll: (ids, wasOpen) => save(new Set(foldLevel(ids, wasOpen))),
  };
}
