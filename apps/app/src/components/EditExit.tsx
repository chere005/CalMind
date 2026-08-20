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
 * ONE WRAPPER, ALWAYS MOUNTED, THE SAME STYLE IN BOTH STATES. The first
 * version rendered a bare fragment until edit mode armed and a Pressable
 * after — so on the phone, arming edit mode reparented every block into a
 * single child and the screen's `gap` between them collapsed: the whole list
 * shifted the moment the grips appeared, on every screen that uses this
 * (Sean, 2026-08-20: "items are shifting around when entering edit mode
 * across multiple apps"). No browser test could see it, because the web
 * branch rendered a fragment either way. Now both states render one host
 * view with one `style`, so arming cannot change a single measurement —
 * the class of bug is gone rather than patched.
 *
 * THE STYLE IS THE SCREEN'S CONTENT LAYOUT (padding + gap + flexGrow),
 * moved here off the ScrollView's contentContainerStyle. That is not
 * cosmetic: the padding gutters beside the rows belong to whoever owns the
 * padding, and when the container owned it a tap in the gutter landed on a
 * non-responder and DIED — on the web the same tap exits. Owning the
 * padding makes the gutter this Pressable's own surface.
 *
 * A View when inactive rather than a disabled Pressable, so nothing is a
 * responder during drags — dragging a row is the whole point of edit mode.
 * View and Pressable render the same host component, so the swap itself
 * reflows nothing.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function EditExit({
  active,
  onExit,
  style,
  children,
}: {
  active: boolean;
  onExit: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  // The web keeps its document listener and never mounts a responder here —
  // it mounted mid-press once and closed edit mode on the very click that
  // opened it; the spec went red on exactly that. A plain View carries the
  // layout so both platforms draw the same tree.
  if (!active || Platform.OS === 'web') {
    return <View style={[s.fill, style]}>{children}</View>;
  }
  return (
    <Pressable onPress={onExit} style={[s.fill, style]} accessible={false}>
      {children}
    </Pressable>
  );
}

/**
 * Spread onto a ROW while its screen's edit mode is on: the row swallows a
 * tap that lands on its own padding instead of letting it bubble out to
 * EditExit. The web's allow-list KEEPS rows (`rem-`, `note-`), so a tap on a
 * row's blank edge stays in edit mode there — but on the phone the row was a
 * plain View, the tap bubbled to the Pressable behind it, and edit mode
 * closed under a finger that was aiming at the row (Sean, 2026-08-20: "tap
 * to exit isn't working faithfully"). Claiming the responder is all it takes:
 * children (the tick, the body, the cluster) are asked first and still win.
 * On the web this is a no-op — the document listener already keeps rows.
 */
export const stayInEdit =
  Platform.OS === 'web' ? {} : { onStartShouldSetResponder: () => true };

const s = StyleSheet.create({
  // flexGrow so the wrapper covers the leftover height of a short list too,
  // matching the backdrop it sits beside rather than ending at the last row.
  fill: { flexGrow: 1 },
});
