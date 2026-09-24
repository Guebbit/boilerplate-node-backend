---
source: src/modules/account/tests/unit/cookies.test.ts
sha256: 1e5d49a4f6686df963d27148aa9f80cdb25c21499c13e144ca009f3d40456605
generated_at: 2026-09-23T18:15:09.731044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the four auth-cookie helpers in `session/cookies.ts`. Each test locks down a security invariant: `jwt` must be `httpOnly` (stealable = account takeover), `isAuth` must _not_ be (frontend reads it), `secure` must track `NODE_ENV`, and destroy calls must repeat the exact flags used at creation or the browser silently keeps the cookie alive.

## Key elements

- **`makeResponse()`** – returns an `asStub`-typed Express `Response` whose `cookie` and `clearCookie` are `jest.fn()`, letting tests destructure `(name, value, options)` from call arguments.
- **`describe('createRefreshCookie')`** (5 tests) – asserts `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`; `secure` flips on `NODE_ENV`; `maxAge` derives from `RefreshTokenExpiryTime.SHORT` (→ 3 600 000 ms) or falls back to the access-token window (→ 900 000 ms).
- **`describe('destroyRefreshCookie')`** (2 tests) – asserts `clearCookie` is called with the _same_ flag triple the create path used, including the env-dependent `secure` flag.
- **`describe('createLoggedCookie')`** (2 tests) – asserts `isAuth` is set to `'true'`, `httpOnly` is explicitly **undefined** (not `false`), and `maxAge` matches the refresh cookie it describes.
- **`describe('destroyLoggedCookie')`** (1 test) – asserts `clearCookie('isAuth', { path: '/' })`.
- **`beforeEach` / `afterEach`** – set real `NODE_TOKEN_REFRESH_TIME_SHORT` / `NODE_TOKEN_ACCESS_TIME` values so `maxAge` assertions exercise actual config wiring; restore original env state after every test.

## Relationships

- **`src/modules/account/session/cookies.ts`** – the module under test; imports all four exported functions (`createRefreshCookie`, `destroyRefreshCookie`, `createLoggedCookie`, `destroyLoggedCookie`).
- **`src/modules/account/session/config.ts`** – imports `RefreshTokenExpiryTime` (the expiry-tier enum) to drive `maxAge` assertions without mocking the config module.
- **`tests/support/stub.ts`** – imports `asStub` to type-cast the plain object into a mock `Response`, keeping the test free of a full Express/Supertest dependency.

## Notes

- The `isAuth` httpOnly test asserts `toBeUndefined()`, **not** `toBe(false)`. This deliberately distinguishes "flag absent" from "flag explicitly off" so a future "hardening" pass that adds `httpOnly: false` to `isAuth` will fail the test.
- `maxAge` values (3 600 000, 900 000) are computed from real env vars set in `beforeEach`; the test does **not** mock `config.ts`, so it catches wiring mistakes (e.g. seconds vs. milliseconds) that a mocked config would hide.
- The destroy/create parity is the most consequential invariant: browsers only clear a cookie when `name + path + flags` all match. A single missing flag (e.g. `httpOnly`) in the destroy call leaves the session cookie in place, producing a silent logout failure.
