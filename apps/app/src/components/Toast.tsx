/**
 * The brief confirmation, as a popup in the MIDDLE of the screen.
 *
 * Sean, 2026-08-12: "copied as markdown should be a popup in the middle of the
 * screen, not text that randomly inserts itself". It was a `<Text>` — two of
 * them, in fact, one under the top bar and one pinned beside the note editor's
 * Copy — and being a laid-out child is exactly the complaint: appearing pushed
 * the page down by its own height, and vanishing pulled it back up, so copying
 * something made the list you were reading jump twice.
 *
 * ONE HOST, AT THE ROOT — and since 2026-08-19, ALWAYS ON TOP (Sean: "just
 * make the toast always on top"), which closed the one gap the old design
 * accepted: a toast raised while a Modal was open drew BEHIND it, because a
 * modal is its own window above the whole app. HOW it gets on top differs
 * by surface — ToastHost.tsx (native: a transparent Modal window of its
 * own, tap-to-dismiss) and ToastHost.web.tsx (a body-level portal at max
 * z-index, click-through) carry the two mechanisms and their reasoning,
 * including why the web half is neither an in-tree fill (capped at 0 by
 * react-native-web's own wrappers — the spec caught it) nor the RNW Modal
 * (traps focus, would blur the note editor mid-typing). This file owns
 * WHAT is said and for how long.
 */
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ToastHost } from './ToastHost';
import { themed, T } from '../theme';

type Show = (message: string, ms?: number) => void;

const ToastCtx = React.createContext<Show>(() => {});

/** Say something briefly. The default is the two seconds the copy notice had. */
export function useToast(): Show {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Cleared on unmount, or a timer outlives the tree and sets state on it.
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback<Show>((message, ms = 2000) => {
    setMsg(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), ms);
  }, []);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setMsg(null);
  }, []);
  const card = msg !== null && (
    <View style={s.card}>
      <Text testID="toast" style={s.text}>{msg}</Text>
    </View>
  );
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg !== null && <ToastHost onDismiss={dismiss}>{card}</ToastHost>}
    </ToastCtx.Provider>
  );
}

const s = themed(() => StyleSheet.create({
  card: {
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: '80%',
  },
  text: { color: T.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
}));
