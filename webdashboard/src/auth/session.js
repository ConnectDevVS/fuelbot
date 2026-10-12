// Who is signed in (/auth/me, dashboard plan §2.5) and what they may do. The UI never copies the
// role table: can() reads the server's effective permissions.
//
// signIn / changePassword are plain async calls, NOT React Query mutations: a mutation keeps its
// variables (the password) in the query client's cache, and no password may ever sit there.
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

/** Changes the password; the response has the /auth/me shape (a new session and expiry). */
export async function changePassword(queryClient, current, next) {
  const me = await api('POST', '/auth/password', { body: { current, new: next } });
  queryClient.setQueryData(ME, me);
  return me;
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
