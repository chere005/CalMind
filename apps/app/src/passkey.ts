/**
 * The browser half of a passkey.
 *
 * Web only, deliberately. React Native has no navigator.credentials, and the
 * native tiers want the platform APIs rather than a shim — so every entry
 * point here is guarded by `passkeySupported()`, and the screens hide their
 * buttons rather than offering something that throws when pressed.
 */
import { b64uToBytes, bytesToB64u } from '@calmind/core';
import { apiPost, type Session } from './api';

type Begin = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  authenticatorSelection: AuthenticatorSelectionCriteria;
  attestation: AttestationConveyancePreference;
  excludeCredentials: { type: 'public-key'; id: string }[];
};

export type PasskeyRow = { id: string; label: string; created: number; used: number };

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
}

/**
 * Whether the device itself can make one. A phone browser with no biometrics
 * says no here, and the honest thing is to not offer the button at all.
 */
export async function passkeyAvailable(): Promise<boolean> {
  if (!passkeySupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const buf = (s: string): ArrayBuffer => b64uToBytes(s).buffer as ArrayBuffer;
const str = (b: ArrayBuffer): string => bytesToB64u(new Uint8Array(b));

export async function addPasskey(s: Session, label: string): Promise<void> {
  const o = await apiPost<Begin>(s.serverUrl, { action: 'passkey_register_begin' }, s.token);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: buf(o.challenge),
      rp: o.rp,
      user: { id: buf(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams,
      authenticatorSelection: o.authenticatorSelection,
      attestation: o.attestation,
      excludeCredentials: o.excludeCredentials.map((c) => ({ type: c.type, id: buf(c.id) })),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('no passkey was created');
  const r = cred.response as AuthenticatorAttestationResponse;
  await apiPost(
    s.serverUrl,
    {
      action: 'passkey_register_finish',
      label,
      clientDataJSON: str(r.clientDataJSON),
      attestationObject: str(r.attestationObject),
    },
    s.token,
  );
}

/**
 * No username is asked for. The passkey is discoverable, so the authenticator
 * is what says who this is — which is also why the server can answer the
 * "begin" call without being told a name to confirm or deny.
 */
export async function signInWithPasskey(serverUrl: string): Promise<Session> {
  const o = await apiPost<{ challenge: string; rpId: string; userVerification: UserVerificationRequirement }>(
    serverUrl,
    { action: 'passkey_login_begin' },
  );
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: buf(o.challenge),
      rpId: o.rpId,
      userVerification: o.userVerification,
    },
    mediation: 'optional',
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('no passkey was offered');
  const r = cred.response as AuthenticatorAssertionResponse;
  const out = await apiPost<{ token: string; username: string }>(serverUrl, {
    action: 'passkey_login_finish',
    id: cred.id,
    clientDataJSON: str(r.clientDataJSON),
    authenticatorData: str(r.authenticatorData),
    signature: str(r.signature),
  });
  return { token: out.token, username: out.username, serverUrl };
}

export const listPasskeys = (s: Session) =>
  apiPost<{ passkeys: PasskeyRow[] }>(s.serverUrl, { action: 'passkey_list' }, s.token)
    .then((r) => r.passkeys);

export const removePasskey = (s: Session, id: string) =>
  apiPost(s.serverUrl, { action: 'passkey_remove', id }, s.token);
