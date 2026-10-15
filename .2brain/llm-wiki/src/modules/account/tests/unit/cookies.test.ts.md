---
source: src/modules/account/tests/unit/cookies.test.ts
sha256: 670a416a0643297276aa42d0d573bab6a4fb9aedecb10737cde109a99cf6f1b3
generated_at: 2026-10-15T10:14:26.548207+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the session-cookie module that pin down the security contract of `createSessionCookie` and `destroySessionCookie`: the credential cookie (`__Host-session`) must be `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, and `domain`-less; the companion `isAuth` hint must be deliberately **not** `httpOnly`; and clearing must repeat the same flags so the browser actually drops the cookie. Each rule is asserted in isolation so a regression in any single flag fails on its own.

## Key elements

- **`makeResponse()`** – factory returning a stubbed Express `Response` whose `cookie` and `clearCookie` are `jest.fn()`s, so tests can inspect the exact `(name, value, options)` triples passed to Express.
- **`beforeEach`** – sets real `NODE_SESSION_TIME_SHORT` (`'3600'`) and `NODE_TOKEN_ACCESS_TIME` (`'900'`) via `setEnvironment`, ensuring `maxAge` assertions exercise actual token-config wiring rather than a permissive mock.
- **`describe('createSessionCookie')`** – six tests covering: the full flag set on first call, `secure: true` under `production` / unset / `development` `NODE_ENV`, explicit `maxAge` passthrough, and browser-session behaviour when `maxAge` is omitted (both `maxAge` and `expires` must be `undefined`).
- **`describe('destroySessionCookie')`** – two tests verifying `clearCookie` is called with `__Host-session` and a flag subset (`httpOnly`, `sameSite`, `path`) that matches the set-cookie flags, plus `secure: true` in production.
- **`describe('the isAuth hint set with the session cookie')`** – three tests on the second `cookie` call: name/value, explicitly **not** `httpOnly`, `sameSite: 'lax'`, `path: '/'`, and `maxAge` mirroring the session cookie (or `undefined` for browser-session).
- **`describe('the isAuth hint cleared with the session cookie')`** – one test confirming `clearCookie('isAuth', { path: '/' })`.

## Relationships

- **`src/modules/account/session/cookies.ts`** – the module under test; this file imports `createSessionCookie` and `destroySessionCookie` and asserts their observable side-effects on a mock `Response`.
- **`tests/support/environment.ts`** – provides `setEnvironment` used to toggle `NODE_ENV` and session-time values per-test.
- **`tests/support/stub.ts`** – provides `asStub`, a typed cast helper used to build the mock `Response` object.

## Notes

- `secure` is asserted `true` for **every** `NODE_ENV` value (including `development`) because the `__Host-` prefix requires it at the browser level; the test documents that browsers accept it on `localhost`.
- The `isAuth` cookie is asserted `httpOnly: undefined` (not `false`) to make the "deliberately readable" intent explicit and guard against someone flipping it to `true` during a blanket hardening pass.
- The `destroySessionCookie` tests use `expect.objectContaining` rather than strict equality, acknowledging that the clear-call may carry additional flags (e.g. `secure`) without breaking the contract.
