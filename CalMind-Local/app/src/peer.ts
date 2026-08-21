/**
 * The Bonjour peer link, JS side.
 *
 * The native module is a dumb pipe that carries opaque JSON; every rule about
 * what a record is and which copy wins lives in `@calmind/core`, so the phone
 * and the Mac merge by the same code the app already renders from. A second
 * implementation of last-write-wins in Swift is exactly the kind of thing that
 * drifts from the first and is only noticed when two devices disagree.
 *
 * There is nothing to configure and no address to type: two devices that know
 * the same passphrase find each other, and one that does not is refused by the
 * TLS handshake before any record is read.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnyRec } from '@calmind/core';

type Native = {
  deviceName?: string;
  start: (passphrase: string, deviceId: string, deviceName: string) => void;
  stop: () => void;
  send: (json: string) => void;
  sendTo: (peerId: string, json: string) => void;
  peers: () => { id: string; name: string }[];
  addListener?: (event: string, cb: (payload: never) => void) => { remove(): void };
};

let native: Native | null = null;
if (Platform.OS === 'ios') {
  try {
    // requireOptionalNativeModule keeps Expo Go and any build without the
    // module clean — the app simply has no peers there, which is the same
    // state as being the only device on the network.
    const { requireOptionalNativeModule } = require('expo-modules-core');
    native = requireOptionalNativeModule('PeerSync');
  } catch {
    native = null;
  }
}

export const peerAvailable = (): boolean => native !== null;

/** What the other devices will call this one. */
export const deviceLabel = (): string => native?.deviceName || 'This device';

export type PeerState = { state: 'off' | 'listening' | 'blocked' | 'failed'; detail: string };
export type Peer = { id: string; name: string };

const PASS_KEY = 'calmind.local.peer.passphrase';
const ID_KEY = 'calmind.local.peer.deviceId';

/**
 * The pairing phrase.
 *
 * Kept in AsyncStorage rather than the Keychain, and that is a considered
 * choice rather than a shortcut: it guards the store against other devices on
 * the same network, and anyone who can read this app's AsyncStorage is already
 * holding the store itself, which sits beside it in the same container. A
 * stronger box for the key than for the thing it locks would be theatre.
 */
export async function passphrase(): Promise<string> {
  const held = await AsyncStorage.getItem(PASS_KEY).catch(() => null);
  if (held) return held;
  const fresh = freshPassphrase();
  await AsyncStorage.setItem(PASS_KEY, fresh).catch(() => {});
  return fresh;
}

export async function setPassphrase(v: string): Promise<void> {
  await AsyncStorage.setItem(PASS_KEY, v.trim().toUpperCase()).catch(() => {});
}

/** Four groups of four, from an alphabet with no O/0 or I/1 — it is read off
 *  one screen and typed into another, once per device. */
function freshPassphrase(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => a[Math.floor(Math.random() * a.length)];
  return [0, 1, 2, 3].map(() => [0, 1, 2, 3].map(pick).join('')).join('-');
}

/** Stable across launches — a fresh id every launch would leave every other
 *  device's peer list full of ghosts. */
export async function deviceId(): Promise<string> {
  const held = await AsyncStorage.getItem(ID_KEY).catch(() => null);
  if (held) return held;
  const fresh = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  await AsyncStorage.setItem(ID_KEY, fresh).catch(() => {});
  return fresh;
}

export type PeerHandlers = {
  /** Records arriving from a peer, already parsed. */
  onRecords: (recs: AnyRec[]) => void;
  onPeers: (peers: Peer[]) => void;
  onState: (s: PeerState) => void;
};

let subs: { remove(): void }[] = [];

export async function startPeer(deviceName: string, h: PeerHandlers): Promise<void> {
  if (!native) return;
  stopPeer();
  const mod = native as unknown as {
    addListener?: (e: string, cb: (p: never) => void) => { remove(): void };
  };
  // Listeners are attached in their own try, and the link is STARTED whatever
  // happens to them. They used to be attached first, in the same statement
  // list: a module without `addListener` threw here, `startPeer` rejected, and
  // because the caller launches it with `void` the whole link silently never
  // started — which on screen is indistinguishable from "nobody else is
  // running". Failing to observe the link must not prevent having one.
  try {
    subs = mod.addListener ? [
      mod.addListener('onRecords', ((p: { json: string }) => {
      try {
        const recs = JSON.parse(p.json) as AnyRec[];
        if (Array.isArray(recs) && recs.length > 0) h.onRecords(recs);
      } catch {
        // A peer that sends something unreadable is not a reason to fall over.
        // It cannot be acted on, and the next message is a fresh chance.
      }
    }) as never),
      mod.addListener('onPeers', ((p: { peers: Peer[] }) => h.onPeers(p.peers ?? [])) as never),
      mod.addListener('onState', ((p: PeerState) => h.onState(p)) as never),
    ] : [];
  } catch (e) {
    h.onState({ state: 'failed', detail: `events unavailable: ${String(e)}` });
  }
  native.start(await passphrase(), await deviceId(), deviceName);
}

export function stopPeer(): void {
  for (const s of subs) s.remove();
  subs = [];
  native?.stop();
}

/** Hand these records to every connected peer. */
export function sendRecords(recs: AnyRec[]): void {
  if (!native || recs.length === 0) return;
  native.send(JSON.stringify(recs));
}

/** Everything we hold, for a peer that has just appeared. */
export function sendAllTo(peerId: string, recs: AnyRec[]): void {
  if (!native) return;
  native.sendTo(peerId, JSON.stringify(recs));
}
