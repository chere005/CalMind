/**
 * The settings window: change password (revokes every other device, keeps this
 * one signed in on the fresh token), then Log out / Done — the suite's layout,
 * one modal.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiPost, changePassword, logout } from '../api';
import { useStore } from '../store';
import { CircleBtn, Field, Pill, ErrorLine } from '../ui';
import { T } from '../theme';

export function Settings({ onClose }: { onClose: () => void }) {
  const { session, setSession, signOut } = useStore();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const change = async () => {
    setErr('');
    setMsg('');
    try {
      const r = await changePassword(session!, oldPass, newPass);
      await setSession({ ...session!, token: r.token });
      setOldPass('');
      setNewPass('');
      setMsg('Password changed — other devices sign in again.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'something went wrong');
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.h2}>Settings</Text>
          <Text style={s.who}>{session?.username}</Text>
          <Field value={oldPass} onChangeText={setOldPass} placeholder="Current password" secureTextEntry />
          <Field value={newPass} onChangeText={setNewPass} placeholder="New password" secureTextEntry />
          <Pill label="Change password" onPress={change} />
          {msg ? <Text style={s.ok}>{msg}</Text> : null}
          <ErrorLine text={err} />
          {note ? <Text style={s.note}>{note}</Text> : null}
          {/* The suite's settings footer: one row of three identical round icon
              buttons — Share, Widget, Done (the accent checkmark). Share and
              Widget say where they are on the roadmap until those land. */}
          <View style={s.footer}>
            <CircleBtn glyph="⇗" size={40} onPress={() => setNote('Sharing lands with partner lists — next on the roadmap.')} />
            <CircleBtn
              glyph="▤"
              size={40}
              onPress={async () => {
                try {
                  const r = await apiPost<{ token: string }>(session!.serverUrl, { action: 'widget_token' }, session!.token);
                  const base = session!.serverUrl.replace(/\/api\/index\.php$/, '');
                  setNote(`Widget feed (paste into tools/scriptable-widget.js):\n${base}/api/index.php?feed=1&t=${r.token}`);
                } catch {
                  setNote('Could not mint the widget token — try again online.');
                }
              }}
            />
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

const s = StyleSheet.create({
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
  ok: { color: T.accent, fontSize: 13 },
  note: { color: T.dim, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
});
