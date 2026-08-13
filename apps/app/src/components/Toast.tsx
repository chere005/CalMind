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
 * ONE HOST, AT THE ROOT, and that is the part that matters rather than the
 * styling. Two things follow from it that a per-screen overlay cannot give:
 *
 *   - It draws over everything. A sibling laid out before the page content is
 *     painted UNDER it on the native builds, which is where the top bar's
 *     notice sits — so a toast owned by TopBar would have been behind the very
 *     list it was reporting on.
 *   - It costs no layout and eats no taps. `pointerEvents: 'none'` on the fill
 *     means the popup is not in the way of the next thing you press, which a
 *     Modal would be: a transparent RN Modal is its own window and swallows
 *     touches over its whole area whatever its children say, so two undos in a
 *     row — which undodelete.spec.ts does — would have had the second one
 *     land on the first one's toast.
 *
 * It is deliberately NOT a Modal for that second reason. The cost is that a
 * real Modal open at the same time covers it, since a modal window is above
 * the whole app; the two callers both close theirs first, and a confirmation
 * for something you did inside a sheet belongs in the sheet.
 */
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg !== null && (
        <View style={s.fill} pointerEvents="none">
          <View style={s.card}>
            <Text testID="toast" style={s.text}>{msg}</Text>
          </View>
        </View>
      )}
    </ToastCtx.Provider>
  );
}

const s = themed(() => StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
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
