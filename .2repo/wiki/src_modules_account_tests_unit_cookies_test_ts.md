# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the four cookie helpers in `session/cookies.ts`. They pin down the security-relevant flag combinations (httpOnly, secure, sameSite, path) for both the `jwt` credential cookie and the `isAuth` frontend-hint cookie, and verify that the "destroy" variants emit flag sets that will actually cause the browser to drop the cookie on logout.

## Key elements

- **`makeResponse()`** – local helper that wraps `asStub` to return a typed Express `Response` whose `cookie` and `clearCookie` are `jest.fn()`s, so each test can inspect the exact `(name, value, options)` triple passed to Express.
- **`describe('createRefreshCookie')`** – asserts `jwt` is set with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`; `secure` tracks `NODE_ENV`; `maxAge` is derived from the requested `RefreshTokenExpiryTime` tier or falls back to the access-token window.
- **`describe('destroyRefreshCookie')`** – asserts `clearCookie('jwt', …)` carries the same flag subset used at set-time, including the environment-dependent `secure` flag.
- **`describe('createLoggedCookie')`** – asserts `isAuth` is set to the literal `'true'`, is **not** `httpOnly` (explicitly checked as `undefined`), and shares the refresh cookie's `maxAge`.
- **`describe('destroyLoggedCookie')`** – asserts `clearCookie('isAuth', { path: '/' })`.
- **`beforeEach` / `afterEach`** – save/restore `NODE_ENV`, `NODE_TOKEN_REFRESH_TIME_SHORT`, and `NODE_TOKEN_ACCESS_TIME` so each test runs in isolation with known expiry values (3600 s / 900 s).

## Relationships

- **`src/modules/account/session/cookies.ts`** – the module under test; this file imports and exercises all four exported helpers (`createRefreshCookie`, `destroyRefreshCookie`, `createLoggedCookie`, `destroyLoggedCookie`).
- **`src/modules/account/session/config.ts`** – provides the `RefreshTokenExpiryTime` enum used as the tier argument; the tests depend on the underlying env-var values this config reads.
- **`tests/support/stub.ts`** – supplies the `asStub` type-guard used to type the mock Response without asserting on runtime values.

## Notes

- The `isAuth` `httpOnly` assertion uses `toBeUndefined()` rather than `toBe(false)`. This is intentional: it catches a future refactor that might set `httpOnly: false` explicitly, which some cookie libraries treat differently from the flag being absent.
- `maxAge` assertions use the real numeric values from the env vars (e.g. `3_600_000`) rather than mocking the config module, so a broken wiring in `config.ts` (e.g. seconds vs. milliseconds) would be caught here.
- The destroy tests assert only the flags that matter for browser matching (name + path + security flags). They do **not** assert `maxAge` on `clearCookie`, because a zero/negative expiry is the mechanism by which `clearCookie` works and is not a meaningful flag to pin.
