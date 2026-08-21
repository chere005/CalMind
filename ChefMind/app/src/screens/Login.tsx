/**
 * The ChefMind card: sign in, sign up, and the two-step email recovery. One
 * screen, three modes — the login page never draws chrome, matching the suite.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { defaultServerUrl } from '../config';
import { login, signup, recover, reset } from '../api';
import { useStore } from '../store';
import { Field, Pill, ErrorLine } from '../ui';
import { passkeyAvailable, signInWithPasskey } from '../passkey';
import { themed, T } from '../theme';
import { Logo } from '../Logo';

type Mode = 'signin' | 'signup' | 'recover' | 'reset';

export function Login() {
  const { signIn } = useStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Offered only where the device can actually make one. A button that
  // explains it cannot help you is worse than no button.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => { void passkeyAvailable().then(setCanPasskey); }, []);
  const serverUrl = defaultServerUrl();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if ((mode === 'signup' || mode === 'reset') && password !== confirmPw) {
      setError("those passwords don't match");
      return;
    }
    return run(async () => {
      if (mode === 'signin') {
        const r = await login(serverUrl, username, password);
        await signIn({ token: r.token, username: r.username, serverUrl });
      } else if (mode === 'signup') {
        const r = await signup(serverUrl, username, email, password);
        await signIn({ token: r.token, username: r.username, serverUrl });
      } else if (mode === 'recover') {
        await recover(serverUrl, username);
        setMode('reset');
      } else {
        const r = await reset(serverUrl, username, code, password);
        await signIn({ token: r.token, username: r.username, serverUrl });
      }
    });
  };

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <View style={s.mark}><Logo size={64} /></View>
        <Text style={s.logo}>ChefMind</Text>
        <Field value={username} onChangeText={setUsername} placeholder="Username" autoCapitalize="none" autoCorrect={false} />
        {mode === 'signup' && (
          <Field value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        )}
        {mode === 'reset' && (
          <>
            <Text style={s.hint}>If that account exists, a 6-digit code went to its email.</Text>
            <Field value={code} onChangeText={setCode} placeholder="Code" keyboardType="number-pad" maxLength={6} />
          </>
        )}
        {mode !== 'recover' && (
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'reset' ? 'New password' : 'Password'}
            secureTextEntry
            onSubmitEditing={submit}
          />
        )}
        {(mode === 'signup' || mode === 'reset') && (
          <Field
            testID="login-confirm"
            value={confirmPw}
            onChangeText={setConfirmPw}
            placeholder="Confirm password"
            secureTextEntry
            onSubmitEditing={submit}
          />
        )}
        <ErrorLine text={error} />
        <View style={s.actions}>
          <Pill
            primary
            disabled={busy}
            label={mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Sign up' : mode === 'recover' ? 'Send code' : 'Set password'}
            onPress={submit}
          />
        </View>
        {mode === 'signin' && canPasskey && (
          <View style={s.actions}>
            <Pill
              testID="passkey-signin"
              disabled={busy}
              label="Use a passkey"
              onPress={() => run(async () => { signIn(await signInWithPasskey(serverUrl)); })}
            />
          </View>
        )}
        <View style={s.links}>
          {mode !== 'signin' && <Pill label="Sign in" onPress={() => setMode('signin')} />}
          {mode === 'signin' && <Pill label="Sign up" onPress={() => setMode('signup')} />}
          {mode === 'signin' && <Pill label="Forgot?" onPress={() => setMode('recover')} />}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
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
  mark: { alignItems: 'center', marginBottom: 2 },
  logo: { color: T.accent, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  hint: { color: T.dim, fontSize: 13 },
  actions: { marginTop: 4, alignItems: 'stretch' },
  links: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4 },
}));
