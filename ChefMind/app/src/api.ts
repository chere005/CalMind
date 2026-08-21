/**
 * The thin HTTP edge: suite-style action posts, bearer token, JSON both ways.
 * Every failure becomes an Error carrying the server's message, so screens can
 * show it verbatim.
 */
import type { SyncRequest, SyncResponse, Transport } from '@calmind/core';

export type Session = { token: string; username: string; serverUrl: string };

/**
 * How long a request may hang before it is treated as a failure.
 *
 * `fetch` has no timeout of its own on the web, so a connection that is
 * ACCEPTED and never answered — a captive portal, a dead middlebox, a server
 * that stalls — never settles either way. It is not the same as a refused
 * connection, which rejects at once and is already handled: the app simply
 * waits, and goes on saying "Syncing…" for as long as it is left.
 *
 * 60 seconds because that is NSURLSession's own default, which the native
 * builds have always had. This is the web catching up with the platform rather
 * than a number invented here, and it is comfortably above a slow first sync
 * (a batch is capped at 500 records) while still being finite.
 */
const REQUEST_TIMEOUT_MS = 60_000;

export async function apiPost<T = Record<string, unknown>>(
  serverUrl: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally {
    // In the finally, so a request that FAILS does not leave a timer holding
    // the event loop open — which on native is a warning and on the web is a
    // slow leak of one per failed request.
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as ({ ok?: boolean; error?: string } & T) | null;
  if (!data || data.ok !== true) {
    throw new ApiError(data?.error ?? `server error (${res.status})`, res.status);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const login = (url: string, username: string, password: string) =>
  apiPost<Session>(url, { action: 'login', username, password });
export const signup = (url: string, username: string, email: string, password: string) =>
  apiPost<Session>(url, { action: 'signup', username, email, password });
export const recover = (url: string, username: string) => apiPost(url, { action: 'recover', username });
export const reset = (url: string, username: string, code: string, password: string) =>
  apiPost<Session>(url, { action: 'reset', username, code, password });
export const changePassword = (s: Session, oldPass: string, newPass: string) =>
  apiPost<{ token: string }>(s.serverUrl, { action: 'change_password', old: oldPass, new: newPass }, s.token);
export const logout = (s: Session) => apiPost(s.serverUrl, { action: 'logout' }, s.token).catch(() => null);

/**
 * WHICH STORE ON THE SERVER THIS APP IS.
 *
 * ChefMind shares CalMind's accounts — same server, same users, same tokens
 * (Sean, 2026-08-21: "we might as well reuse calmind logins") — and keeps its
 * own reminders and notes ("its own separate store"). The server holds one
 * record file per user per space: records-<user>.json is CalMind's, and
 * records-chef-<user>.json is this one. Sending the space is the whole of the
 * separation, so it is a constant here rather than anything configurable: a
 * ChefMind build that could be pointed at CalMind's records would merge two
 * apps' stores into whichever one synced last.
 *
 * An OLD server that does not know the parameter ignores it and answers out of
 * the shared file. That is the failure mode to keep in mind when this is
 * deployed ahead of the API — the guard for it is deploy order, not code.
 */
export const SYNC_SPACE = 'chef';

/** The core engine's transport, bound to a session. */
export const syncTransport = (s: Session): Transport => async (req: SyncRequest) => {
  const r = await apiPost<SyncResponse>(
    s.serverUrl,
    { action: 'sync', space: SYNC_SPACE, cursor: req.cursor, changes: req.changes },
    s.token,
  );
  return { cursor: r.cursor, changes: r.changes, rejected: r.rejected };
};
