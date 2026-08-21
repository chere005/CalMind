/**
 * Where the toast's card actually gets DRAWN — the half of "always on top"
 * (Sean, 2026-08-19) that differs by surface. This is the NATIVE half; metro
 * resolves ToastHost.web.tsx on the web.
 *
 * A transparent RN Modal is the only thing that draws over another Modal on
 * native — a sheet is its own window above the whole app, and no zIndex
 * crosses windows. The cost the old design refused: a Modal's window
 * swallows touches over its whole area whatever its children say. So the
 * fill dismisses on first touch — one tap lost at worst, and the window is
 * gone for the next one.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

export function ToastHost({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <Modal transparent statusBarTranslucent animationType="none" onRequestClose={onDismiss}>
      <View style={s.fill} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        {children}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
