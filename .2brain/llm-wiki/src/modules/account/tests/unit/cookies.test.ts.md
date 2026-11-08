---
source: src/modules/account/tests/unit/cookies.test.ts
sha256: 670a416a0643297276aa42d0d573bab6a4fb9aedecb10737cde109a99cf6f1b3
generated_at: 2026-11-08T04:46:10.308026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the two session-cookie functions in `session/cookies.ts`. The file pins down four security invariants that together prevent account takeover or a silently-failing logout: the `__Host-session` cookie must be `httpOnly`, the `isAuth` hint must not be, `secure` must always be true, and `destroySessionCookie` must repeat the exact same flag triple used at set-time.

## Key elements

- **`makeResponse()`** — returns a stubbed Express `Response` whose `cookie` and `clearCookie` are `jest.fn()`, letting each test assert on the exact `(name, value, options)` triples the module passes to Express.
- **`beforeEach`** — sets `NODE_SESSION_TIME_SHORT` and `NODE_TOKEN_ACCESS_TIME` to real numeric strings so `maxAge` assertions exercise the actual token-config wiring rather than a permissive mock.
- **`describe('createSessionCookie')`** — verifies `__Host-session` is set with `httpOnly`, `sameSite: 'lax'`, `path: '/'`, no `domain`, `secure: true` (in production, unset, and development), correct `maxAge`, and that omitting `maxAge` yields a browser-session cookie (no `maxAge`, no `expires`).
- **`describe('destroySessionCookie')`** — asserts `clearCookie` is called for `__Host-session` with the same `httpOnly`/`sameSite`/`path` triple, and that `secure` matches the current environment.
- **`describe('the isAuth hint set …')`** — confirms the companion `isAuth` cookie carries value `'true'`, is explicitly *not* `httpOnly`, shares `sameSite`/`path`, and mirrors the session cookie's `maxAge` (or lack thereof).
- **`describe('the isAuth hint cleared …')`** — confirms `destroySessionCookie` also calls `clearCookie('isAuth', { path: '/' })`.

## Relationships

- **`src/modules/account/session/cookies.ts`** — the unit under test; imports `createSessionCookie` and `destroySessionCookie`.
- **`tests/support/environment.ts`** — provides `setEnvironment` to toggle `NODE_ENV`, `NODE_SESSION_TIME_SHORT`, and `NODE_TOKEN_ACCESS_TIME` per test case.
- **`tests/support/stub.ts`** — provides `asStub`, used to type the mocked Express `Response` without casting.

## Notes

- The `__Host-` prefix is the security mechanism that lets the browser *enforce* `Secure` + no `Domain`; the tests assert both conditions explicitly so a future refactor can't silently drop one.
- `isAuth` being non-`httpOnly` is asserted as a *positive* expectation (`toBeUndefined()`), not just "not true", to guard against someone "hardening" it into `httpOnly: true` by mistake and breaking the frontend's read.
- The `secure` flag is asserted as always `true` (including in `development`), not as a conditional — this is intentional because the `__Host-` prefix *requires* `Secure` regardless of environment.
- No `expires` is ever expected; only `maxAge` (or its absence) is the mechanism for cookie lifetime.
