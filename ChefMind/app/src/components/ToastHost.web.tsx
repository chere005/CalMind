/**
 * The WEB half of "always on top" (Sean, 2026-08-19) — see ToastHost.tsx
 * for the native half and the reasoning split.
 *
 * The card portals into a div appended to document.body at the maximum
 * z-index, because nothing INSIDE the app tree can win: react-native-web
 * wraps the app in divs that establish z-index:0 stacking contexts —
 * measured by copymd.spec, which failed the in-tree attempt before it
 * shipped — so any fill in there is capped at 0, under the sheet portals'
 * 9999. NOT react-native-web's own Modal, deliberately: that traps focus,
 * so a toast fired while typing would blur the note editor and collapse it.
 * pointer-events:none keeps every click falling straight through, so
 * nothing here can eat the second of two undos (undodelete.spec.ts does
 * exactly that).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';

export function ToastHost({ children }: { children: React.ReactNode; onDismiss: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const div = document.createElement('div');
    // The stacking claim, on the portal's own root: body-level sibling of
    // the sheet portals, above their 9999.
    div.style.position = 'fixed';
    div.style.inset = '0';
    div.style.zIndex = '2147483647';
    div.style.pointerEvents = 'none';
    document.body.appendChild(div);
    setHost(div);
    return () => { div.remove(); };
  }, []);
  if (!host) return null;
  return createPortal(
    <View style={s.fill} pointerEvents="none">{children}</View>,
    host,
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
