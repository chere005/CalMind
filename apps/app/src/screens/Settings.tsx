/**
 * The settings window: change password (revokes every other device, keeps this
 * one signed in on the fresh token), then Log out / Done — the suite's layout,
 * one modal.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { prefsOf, prefsPut } from '@calmind/core';
import { apiPost, changePassword, logout } from '../api';
import { useStore } from '../store';
import { CircleBtn, Field, Pill, ErrorLine } from '../ui';
import { applyTheme, currentTheme, themed, T, THEMES, type ThemeName } from '../theme';
import { ShareModal } from '../components/ShareModal';
import { WidgetSetup } from './WidgetSetup';

export function Settings({ onClose }: { onClose: () => void }) {
  const { session, setSession, signOut, recs, mutate } = useStore();
  const pickTheme = (name: ThemeName) => {
    applyTheme(name);
    // The choice syncs like any pref, so every device follows.
    mutate((e) => e.put(prefsPut(recs, 'suite', { theme: name })));
  };
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const change = async () => {
    setErr('');
    setMsg('');
    if (newPass !== confirmPass) {
      setErr("those passwords don't match");
      return;
    }
    try {
      const r = await changePassword(session!, oldPass, newPass);
      await setSession({ ...session!, token: r.token });
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
      setMsg('Password changed — other devices sign in again.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'something went wrong');
    }
  };

  // The suite closes settings before the share window opens — one layer.
  if (shareOpen) return <ShareModal onClose={onClose} />;
  if (widgetOpen) return <WidgetSetup onClose={onClose} />;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.h2}>Settings</Text>
          <Text style={s.who}>{session?.username}</Text>
          <Field value={oldPass} onChangeText={setOldPass} placeholder="Current password" secureTextEntry />
          <Field value={newPass} onChangeText={setNewPass} placeholder="New password" secureTextEntry />
          <Field value={confirmPass} onChangeText={setConfirmPass} placeholder="Confirm new password" secureTextEntry />
          <Pill label="Change password" onPress={change} />
          {msg ? <Text style={s.ok}>{msg}</Text> : null}
          <ErrorLine text={err} />
          <View style={s.themeRow}>
            {(Object.keys(THEMES) as ThemeName[]).map((name) => (
              <Pressable
                key={name}
                testID={`theme-${name}`}
                onPress={() => pickTheme(name)}
                style={[s.swatch, { backgroundColor: THEMES[name].bg }, currentTheme() === name && s.swatchOn]}
              >
                <View style={[s.swatchDot, { backgroundColor: THEMES[name].accent }]} />
              </Pressable>
            ))}
          </View>
          {note ? <Text style={s.note}>{note}</Text> : null}
          {/* The suite's settings footer: one row of three identical round icon
              buttons — Share, Widget, Done (the accent checkmark). Share and
              Widget say where they are on the roadmap until those land. */}
          <View style={s.footer}>
            <CircleBtn testID="open-share" glyph="⇗" size={40} onPress={() => setShareOpen(true)} />
            <CircleBtn testID="open-widget" glyph="▤" size={40} onPress={() => setWidgetOpen(true)} />
            <CircleBtn glyph="✓" size={40} color={T.accent} active onPress={onClose} />
          </View>
          <View style={s.row}>
            <Pill
              label="Log out"
              onPress={async () => {
                if (session) void logout(session);
                await signOut();
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = themed(() => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  h2: { color: T.text, fontSize: 18, fontWeight: '700' },
  who: { color: T.dim, fontSize: 13 },
  themeRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: T.accent },
  swatchDot: { width: 14, height: 14, borderRadius: 7 },
  ok: { color: T.accent, fontSize: 13 },
  note: { color: T.dim, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
}));
