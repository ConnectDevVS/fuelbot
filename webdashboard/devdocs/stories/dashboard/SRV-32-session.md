# SRV-32: API client, session, sign-in and change password

**As a** dashboard user, **I want** to sign in, be made to choose my own
password the first time, be sent back to sign-in when my session ends
(without losing where I was), and sign out, **so that** access is simple
and safe.

- **Refs:**
  - SP §4.4 (auth, temporary passwords), §4.6 (cookie, CSRF, rate limit,
    48 h fixed);
  - DP §2.3 (client), §2.5 (session), §5.1 (pages), §7 (messages);
  - spike B (cookie + CSRF from `fetch`, and through the Vite proxy).
- **Depends on:** SRV-28 (`/auth/me` fields), SRV-31 (e2e).

## Deliverables

1. `src/api/client.js`:
   - `api(method, path, {body, ifMatch, signal})` and `ApiError`;
   - `export const CSRF = {'X-Requested-With': 'fuelbot-dashboard'}`.
2. `src/api/errors.js`: `messageFor(error)` for every code in DP §7;
   `fieldErrors(error)` (for `invalid_body` `details` and the users codes).
3. `src/api/queryClient.js`:
   - a `QueryClient` with the DP §2.6 defaults;
   - a `QueryCache`/`MutationCache` `onError` that routes 401
     `not_signed_in` and 403 `password_change_required` (through a small
     navigation bridge, not `window.location`, to keep SPA state).
4. `src/auth/session.js`:
   - `useMe()` (query key `['me']`, `staleTime: Infinity`);
   - `useCan()` → `can(permission)`;
   - `useDisplayTz()`;
   - `signIn`, `signOut`, `changePassword` (they reset or refetch `['me']`
     and clear the cache on sign-out). **Built as plain async functions,
     not React Query mutations** (changed while building SRV-32): a
     mutation keeps its variables, here the password, in the query
     client's mutation cache, which DP §2.3 forbids.
5. `src/auth/RequireAuth.jsx`:
   - no session → `/sign-in?next=<path>`;
   - `must_change_password` → `/change-password`.
6. `src/auth/SignInPage.jsx`, `src/auth/ChangePasswordPage.jsx` (forced and
   voluntary modes).
7. `src/auth/SessionExpiryBanner.jsx`: shown from 30 min before
   `session_expires_at`. It uses one `setTimeout` to the threshold: that's
   not polling, and it makes no requests.
8. **Form memory across a 401** (`src/auth/pendingForm.js`):
   - forms register their values in a module-level map keyed by path;
   - after sign-in to the same `next`, the form restores them once, then
     clears them;
   - in memory only; never passwords.
9. Strings for all of the above in `strings.js`.

## Spec

- **Sign in:**
  - `POST /auth/login` (CSRF header), then `GET /auth/me`;
  - route per DP §3.2 (`next` wins if it's a `/dashboard/` path; anything
    else is ignored: no open redirect).
- **Messages:** exactly DP §5.1 / §7. The password field keeps its value
  only in the input (no state copy that could be logged).
- **Change password:**
  - `POST /auth/password {current, new}`, then `['me']` is refetched;
  - the repeat field must match (client check);
  - after a forced change → the landing page.
- **Sign out:** `POST /auth/logout`, then `queryClient.clear()`, then
  `/sign-in`.
- **Every request:** `credentials: 'same-origin'`. There's no
  `Authorization` header and no token handling.

## Acceptance criteria

- [ ] `src/api/client.test.js` › "adds CSRF on writes only": the
      `X-Requested-With` header is present on POST/PATCH/PUT/DELETE and
      absent on GET; `If-Match` is sent when given.
- [ ] `src/api/client.test.js` › "throws ApiError with code and details",
      for `{"error":"invalid_body","details":[…]}` and for a non-JSON 502.
- [ ] `src/api/errors.test.js` › "every DP §7 code has a message";
      "invalid_body details map to field paths (menu[2].hopper)";
      "users codes map to fields".
- [ ] `src/auth/redirect.test.js` › "next only accepts dashboard paths"
      (`//evil.com`, `https://…` and `/api/…` → ignored).
- [ ] `e2e/session.spec.js` › "each role signs in and lands correctly":
      staff → `/fleet` (a placeholder until SRV-36); the others →
      `/t/powerfuel/home` (a placeholder until SRV-38).
- [ ] `e2e/session.spec.js` › "wrong password shows one message" (unknown
      email and wrong password give the identical text).
- [ ] `e2e/session.spec.js` › "temporary password forces the change":
      - `new@` sees only the change form, and every nav link is absent;
      - after changing, the landing page;
      - the old password no longer signs in.
- [ ] `e2e/session.spec.js` › "401 mid-session returns to sign-in and back":
      clear the cookie on `/t/powerfuel/sales`, then an action → sign-in →
      after sign-in, back on the same path.
- [ ] `e2e/session.spec.js` › "sign out ends the session": after sign out,
      `GET /api/v1/auth/me` → 401 (the server revoked it).
- [ ] `e2e/session.spec.js` › "no secrets in storage or URLs": after
      sign-in and change password, `localStorage` and `sessionStorage`
      contain no password and every visited URL is free of it.
- [ ] `e2e/session.spec.js` › "expiry banner" (the clock is faked with
      `page.clock` to 47 h 40 min after sign-in → the banner text shows).
- [ ] Screenshots: sign-in (empty, error), change password (forced), the
      expiry banner, in 3 sizes. Looked at.

## Out of scope

"Forgot password" (no email in v1, SP §8), remember-me, and SSO.
