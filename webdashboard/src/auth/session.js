// Who is signed in (/auth/me, dashboard plan §2.5) and what they may do. The UI never copies the
// role table: can() reads the server's effective permissions.
//
// signIn / changePassword / the code calls are plain async calls, NOT React Query mutations: a mutation keeps its
// variables (the password, the code) in the query client's cache, and none may ever sit there.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api/client.js';
import { clearPendingForms } from './pendingForm.js';

export const ME = ['me'];
const fetchMe = () => api('GET', '/auth/me');

export function useMe() {
  return useQuery({ queryKey: ME, queryFn: fetchMe, staleTime: Infinity, retry: false });
}

export function useCan() {
  const { data } = useMe();
  return useCallback((permission) => Boolean(data?.permissions?.includes(permission)), [data]);
}

export function useDisplayTz() {
  return useMe().data?.display_tz ?? 'Asia/Kolkata';
}

/** Signs in and returns /auth/me. Starts from an empty cache (another user may have been here). */
export async function signIn(queryClient, email, password) {
  queryClient.clear();
  await api('POST', '/auth/login', { body: { email, password } });
  return queryClient.fetchQuery({ queryKey: ME, queryFn: fetchMe, staleTime: Infinity });
}

/**
 * Changes the password; the response has the /auth/me shape (a new session and expiry). code: the
 * emailed one, needed while a temporary password is in use (server plan §4.16).
 */
export async function changePassword(queryClient, current, next, code) {
  const me = await api('POST', '/auth/password', { body: { current, new: next, ...(code ? { code } : {}) } });
  queryClient.setQueryData(ME, me);
  return me;
}

/** Mails the signed-in user (on a temporary password) their code. → {ok, expires_at} */
export function requestOwnCode() {
  return api('POST', '/auth/code');
}

/** Forgot password: mails a code if the email belongs to an active account (the answer is the same). */
export function requestResetCode(email) {
  return api('POST', '/auth/forgot', { body: { email } });
}

/** Sets a new password with the emailed code. Doesn't sign in; every session of that user ends. */
export function resetPassword(email, code, next) {
  return api('POST', '/auth/reset', { body: { email, code, new: next } });
}

/** Ends the session on the server, then forgets everything this tab knew. */
export async function signOut(queryClient) {
  try {
    await api('POST', '/auth/logout');
  } finally {
    queryClient.clear();
    clearPendingForms();
  }
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useCallback(() => signOut(queryClient), [queryClient]);
}
