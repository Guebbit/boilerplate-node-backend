---
source: src/modules/account/tests/unit/cookies.test.ts
sha256: d4d059c34799b6fd70920780db2a9955b2b07c713341d6ae20a3da99c0c43578
generated_at: 2026-10-14T09:19:39.197214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the four cookie helpers in `session/cookies.ts`. Each test asserts the exact flag set a browser sees (`httpOnly`, `secure`, `sameSite`, `path`, `domain`, `maxAge`) so that a regression silently weakening an auth cookie or mismatching a `clearCookie` call is caught.

## Key elements

- **`makeResponse()`** — builds a stubbed Express `Response` whose `cookie` and `clearCookie` are `jest.fn()`s, captured via `asStub`. All assertions read from `mock.calls[0]`.
- **`beforeEach`** — sets `NODE_SESSION_TIME_SHORT` and `NODE_TOKEN_ACCESS_TIME` to real values so maxAge assertions exercise the actual config wiring rather than a permissive mock.
- **`describe('createSessionCookie')`** — verifies `__Host-session` is set with `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, no `domain`, `secure: true` (in prod, dev, and unset `NODE_ENV`), and correct `maxAge` / browser-session fallback.
- **`describe('destroySessionCookie')`** — asserts `clearCookie` is called with matching `httpOnly`, `sameSite`, and `path` flags so the browser actually drops the cookie.
- **`describe('createLoggedCookie')`** — asserts `isAuth` carries value `'true'`, is **not** `httpOnly` (frontend-readable), uses `sameSite: 'lax'` / `path: '/'`, and mirrors the session cookie's `maxAge`.
- **`describe('destroyLoggedCookie')`** — asserts `clearCookie('isAuth', { path: '/' })`.

## Relationships

- **`src/modules/account/session/cookies.ts`** — the module under test; provides `createSessionCookie`, `destroySessionCookie`, `createLoggedCookie`, `destroyLoggedCookie`.
- **`tests/support/environment.ts`** — `setEnvironment` is used in `beforeEach` and individual tests to toggle `NODE_ENV` and token-time variables.
- **`tests/support/stub.ts`** — `asStub` supplies the typed cast for the mock Response object.

## Notes

- `secure` is asserted `true` in **every** environment (production, development, unset) because the `__Host-` prefix mandates it; the tests document this as a browser-level constraint, not an env choice.
- The `httpOnly` asymmetry (`true` on session, `undefined` on `isAuth`) is asserted explicitly in both directions to prevent a future "hardening" PR from accidentally making the two cookies indistinguishable.
- `beforeEach` intentionally uses **real** numeric values for token times so that a broken config mapping would fail the maxAge assertions instead of being masked by a mock.
