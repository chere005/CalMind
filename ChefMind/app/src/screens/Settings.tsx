/**
 * The settings window: change password (revokes every other device, keeps this
 * one signed in on the fresh token), then Log out / Done — the suite's layout,
 * one modal.
 */
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { exportFilename, exportStore, exportText, prefsOf, prefsPut } from '@calmind/core';
import { changePassword, logout } from '../api';
import { saveTextFile } from '../savefile';
import { addPasskey, listPasskeys, passkeyAvailable, removePasskey, type PasskeyRow } from '../passkey';
import { useStore } from '../store';
import { syncLook } from '../components/SyncDot';
import { CircleBtn, Field, Pill, ErrorLine } from '../ui';
import { applyTheme, currentTheme, themed, T, THEMES, type ThemeName } from '../theme';
import { ShareModal } from '../components/ShareModal';

export function Settings({ onClose }: { onClose: () => void }) {
  const { session, setSession, signOut, recs, mutate, syncState, persistFailed, refusedLabels } = useStore();
  const pickTheme = (name: ThemeName) => {
    applyTheme(name);
    // The choice syncs like any pref, so every device follows.
    mutate((e) => e.put(prefsPut(recs, 'suite', { theme: name })));
  };
  // 12- vs 24-hour, on 'suite' beside the theme: it is one person's habit, and
  // it syncs, so the phone, the web, the WATCH and the WIDGET all follow one
  // setting rather than four. The native two cannot read a pref record, so the
  // flag rides along in the watch feed.
  const clock24 = prefsOf(recs, 'suite').clock24 === true;
  const setClock24 = (on: boolean) => mutate((e) => e.put(prefsPut(recs, 'suite', { clock24: on })));
  const look = syncLook(syncState, persistFailed, refusedLabels);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [canPasskey, setCanPasskey] = useState(false);
  const [keys, setKeys] = useState<PasskeyRow[]>([]);
  // Whether we actually know. A failed fetch used to leave an empty list,
  // which reads as "you have no passkeys" — so you add another one you did
  // not need, and end up with two on a device that only ever wanted one.
  const [keysKnown, setKeysKnown] = useState(false);
  useEffect(() => {
    void passkeyAvailable().then(setCanPasskey);
    void listPasskeys(session!)
      .then((k) => { setKeys(k); setKeysKnown(true); })
      .catch(() => setKeysKnown(false));
  }, [session]);
  const [confirmPass, setConfirmPass] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

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

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Text style={s.h2}>Settings</Text>
          {/* Colour AND words from the one rule now. This screen used to
              carry its own copy of the sentence beside a dot that read the
              shared one, so the two could disagree — and did the moment the
              message learned to name the record it is about. The ordering
              (a device that cannot write its own copy comes first) lives in
              syncLook with the rest of it. */}
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: look.color }]} />
            <Text style={s.statusText}>{look.text}</Text>
          </View>
          <Text style={s.who}>{session?.username}</Text>
          <Field value={oldPass} onChangeText={setOldPass} placeholder="Current password" secureTextEntry />
          <Field value={newPass} onChangeText={setNewPass} placeholder="New password" secureTextEntry />
          <Field value={confirmPass} onChangeText={setConfirmPass} placeholder="Confirm new password" secureTextEntry />
          <Pill label="Change password" onPress={change} />
          {canPasskey && (
            <View testID="passkey-section" style={s.pkSection}>
              <Text style={s.pkHead}>Passkeys</Text>
              {!keysKnown && (
                <Text testID="passkey-unknown" style={s.pkNote}>
                  Could not check this account&apos;s passkeys — offline? Adding one now may
                  leave you with a duplicate.
                </Text>
              )}
              {keys.map((k) => (
                <View key={k.id} style={s.pkRow}>
                  <Text style={s.pkLabel} numberOfLines={1}>{k.label}</Text>
                  <Pressable
                    testID="passkey-remove"
                    hitSlop={8}
                    onPress={() => {
                      void removePasskey(session!, k.id)
                        .then(() => setKeys((ks) => ks.filter((x) => x.id !== k.id)))
                        .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'could not remove it'));
                    }}
                  >
                    <Text style={s.pkX}>×</Text>
                  </Pressable>
                </View>
              ))}
              <Pill
                testID="passkey-add"
                label="Add a passkey"
                onPress={() => {
                  setErr('');
                  void addPasskey(session!, `${Platform.OS} passkey`)
                    .then(() => listPasskeys(session!).then(setKeys))
                    .then(() => setMsg('Passkey added'))
                    .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'could not add it'));
                }}
              />
              {/* A passkey is an addition. Saying so where someone might
                  otherwise assume their password just stopped working. */}
              <Text style={s.pkNote}>Your password still works.</Text>
            </View>
          )}
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
          <View style={s.clockRow}>
            <Text style={s.clockLabel}>Time format</Text>
            <View style={s.clockSeg}>
              <Pressable
                testID="clock-12"
                onPress={() => setClock24(false)}
                style={[s.clockOpt, !clock24 && s.clockOptOn]}
              >
                <Text style={[s.clockOptText, !clock24 && s.clockOptTextOn]}>12h</Text>
              </Pressable>
              <Pressable
                testID="clock-24"
                onPress={() => setClock24(true)}
                style={[s.clockOpt, clock24 && s.clockOptOn]}
              >
                <Text style={[s.clockOptText, clock24 && s.clockOptTextOn]}>24h</Text>
              </Pressable>
            </View>
          </View>
          {/* The suite's settings footer, now one round icon button and the
              accent checkmark: Share and Done. The Widget button opened the
              Scriptable setup page, and the Scriptable widget was removed
              entirely on Sean's word (2026-08-12). */}
          <View style={s.footer}>
            <CircleBtn testID="open-share" glyph="⇗" label="Sharing" size={40} onPress={() => setShareOpen(true)} />
            <CircleBtn glyph="✓" label="Done" size={40} color={T.accent} active onPress={onClose} />
          </View>
          <View style={s.row}>
            <Pill
              testID="export-data"
              label="Export my data"
              onPress={() => {
                setErr('');
                // Behaviour (what the file holds, what it is called) is
                // core's; this is only the hand-off to the platform.
                const file = exportStore(recs, session?.username ?? 'me');
                void saveTextFile(exportFilename(file.account, file.exported), exportText(file))
                  .then(() => setMsg('Exported.'))
                  .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'could not export'));
              }}
            />
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
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: T.dim, fontSize: 13 },
  who: { color: T.dim, fontSize: 13 },
  themeRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 4 },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  clockLabel: { color: T.text, fontSize: 14 },
  clockSeg: { flexDirection: 'row', borderWidth: 1, borderColor: T.line, borderRadius: 999, overflow: 'hidden' },
  // paddingVertical 9, not 6: at 6 both segments measured 28pt tall, under the
  // 30 the tap-target sweep calls awkward. Real padding rather than a
  // WebHitSlop, for two reasons that both matter here — clockSeg sets
  // `overflow: 'hidden'`, which would clip an overlay, and these two sit edge
  // to edge, so overlapping slop would make the boundary between 12h and 24h
  // ambiguous in a control whose whole job is to be unambiguous. 9 matches the
  // habit name box; the pill grows 6pt and nothing else moves.
  clockOpt: { paddingHorizontal: 14, paddingVertical: 9, minWidth: 52, alignItems: 'center' },
  clockOptOn: { backgroundColor: T.accentSoft },
  clockOptText: { color: T.dim, fontSize: 13, fontWeight: '600' },
  clockOptTextOn: { color: T.accent },
  pkSection: { gap: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: T.line, paddingTop: 10 },
  pkHead: { color: T.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  pkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pkLabel: { color: T.text, fontSize: 14, flexShrink: 1 },
  pkX: { color: T.dim, fontSize: 20, lineHeight: 22 },
  pkNote: { color: T.muted, fontSize: 12 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: T.accent },
  swatchDot: { width: 14, height: 14, borderRadius: 7 },
  ok: { color: T.accent, fontSize: 13 },
  note: { color: T.dim, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
}));
