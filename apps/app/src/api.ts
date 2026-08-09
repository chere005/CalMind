/**
 * The thin HTTP edge: suite-style action posts, bearer token, JSON both ways.
 * Every failure becomes an Error carrying the server's message, so screens can
 * show it verbatim.
 */
import type { SyncRequest, SyncResponse, Transport } from '@calmind/core';

export type Session = { token: string; username: string; serverUrl: string };

export async function apiPost<T = Record<string, unknown>>(
  serverUrl: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const res = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
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

/** The core engine's transport, bound to a session. */
export const syncTransport = (s: Session): Transport => async (req: SyncRequest) => {
  const r = await apiPost<SyncResponse>(s.serverUrl, { action: 'sync', cursor: req.cursor, changes: req.changes }, s.token);
  return { cursor: r.cursor, changes: r.changes, rejected: r.rejected };
};
