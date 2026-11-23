---
source: src/modules/account/tests/unit/cookies.test.ts
source_sha256: 36216fab9d8b8e671f149fc904192ab798835f4d9d2aa7c5b98b3a5f6aca669d
context_sha256: 1dfd93e90c91979ad391facb321d00a8b897ad32c10180f84b00391d3ae03a16
generated_at: 2026-11-22T04:04:33.632510+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/cookies.test.ts

## Purpose
Unit tests for the auth cookie helpers in `src/kernel/cookies.ts`. They check the cookie flags that decide whether a session can be stolen or survive logout. The tests assert on the arguments handed to a stubbed Express `Response`. They cover `httpOnly` on the credential, a readable `isAuth` hint, `secure` handling, and clearing with the same flags the cookie was set with.

## Key elements
- `makeResponse()`: builds a stub `Response` with `cookie` and `clearCookie` as `jest.Mock`s, via `asStub`. It records the `(name, value, options)` calls.
- `beforeEach`: sets `NODE_SESSION_TIME_SHORT=3600` and `NODE_TOKEN_ACCESS_TIME=900` through `setEnvironment`, so `maxAge` assertions run against the real token-config wiring and not a mock.
- `describe('createSessionCookie')`:
  - The `__Host-session` cookie is `httpOnly`, `sameSite: 'lax'`, `path: '/'`, has no `domain`, and is `secure`.
  - `secure` is `true` in production, when `NODE_ENV` is unset, and in development.
  - `maxAge` is passed through when given, and both `maxAge` and `expires` are undefined when it is omitted (a browser-session cookie).
- `describe('destroySessionCookie')`: `clearCookie('__Host-session', …)` is called with `httpOnly`, `sameSite: 'lax'` and `path: '/'`, and with `secure: true` in production.
- `describe('the isAuth hint set with the session cookie')`: the second `cookie` call is `isAuth='true'`. It is not `httpOnly`, so the frontend can read it. It uses `sameSite: 'lax'` and `path: '/'`. Its `maxAge` matches the session cookie's, and is undefined when the session cookie's is.
- `describe('the isAuth hint cleared with the session cookie')`: `clearCookie` is called with `('isAuth', { path: '/' })`.

## Relationships
- `src/modules/account/session/cookies.ts`: the module under test. It supplies `createSessionCookie` and `destroySessionCookie`.
- `tests/support/environment.ts`: supplies `setEnvironment`, which sets or unsets env vars (`NODE_ENV`, session and token times).
- `tests/support/stub.ts`: supplies `asStub`, which casts the partial mock object to a `Response`-shaped type.

## Notes
- Tests read the cookie calls by index: `cookie.mock.calls[0]` is the session cookie and `[1]` is `isAuth`. This depends on the order in which `createSessionCookie` sets them.
- `secure` is expected to be `true` in every environment, including development and unset `NODE_ENV`. The test comments give the reason: the `__Host-` prefix requires `Secure`, and browsers accept it on localhost. The "tracks production" idea in the module header is therefore only asserted as "always true".
- The `isAuth` clear is asserted to use only `{ path: '/' }`. The session cookie clear is checked with `objectContaining`, so extra options would not fail that test.
