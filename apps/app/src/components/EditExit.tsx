/**
 * Tap anywhere that is not a control to leave edit mode — on the PHONE.
 *
 * The three screens already do this on the web with a document-level click
 * listener, ported from the suite's rule ("a tap stays in edit only if it
 * lands on the thing you're editing or an edit control"). That listener needs
 * a `document`, so on iOS and Android the only way out was the Done button.
 * Sean asked for the tap, tried it on his phone, and reported it as still
 * broken — correctly, because it had never worked there.
 *
 * Native needs the opposite mechanism to the web's, for a reason worth
 * writing down:
 *
 *   - On the WEB every element is a div, a click on any of them bubbles to
 *     document, and the allow-list decides. A wrapper would be redundant.
 *   - On NATIVE a plain View does not want to be a responder at all, so a
 *     touch on blank space or on a bare Text passes straight up to the
 *     nearest ancestor that does. A Pressable ancestor IS that mechanism —
 *     and a child Pressable (a row, a button, a chevron) is asked first and
 *     wins, which is the allow-list, enforced by the responder system rather
 *     than by a selector list anyone has to maintain.
 *
 * So this is a no-op wrapper until edit mode is on, and a Pressable while it
 * is. Inactive it renders children untouched — a wrapper that is always
 * present would put a responder in the tree during drags, and dragging a row
 * is the whole point of edit mode.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

export function EditExit({
  active,
  onExit,
  children,
}: {
  active: boolean;
  onExit: () => void;
  children: React.ReactNode;
}) {
  // NATIVE ONLY, and the web spec is what forced it. On the web the wrapper
  // mounts during the very press that opened edit mode, so the pointerup's
  // click bubbles into it and closes edit mode again the instant it opens —
  // the spec went red on exactly that. The web already has its document
  // listener and an allow-list; it never needed this.
  if (!active || Platform.OS === 'web') return <>{children}</>;
  return (
    // flexGrow so the wrapper covers the leftover height of a short list too,
    // matching the backdrop it sits beside rather than ending at the last row.
    <Pressable onPress={onExit} style={s.fill} accessible={false}>
      {children}
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { flexGrow: 1 },
});
