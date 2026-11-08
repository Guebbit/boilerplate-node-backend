---
source: src/modules/account/tests/unit/device-cookie.test.ts
sha256: 8903ffef28ca7b02d9450d84883602ba44ce5b873ee0fe389252c2235acbeb2c
generated_at: 2026-11-08T04:46:20.682562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/device-cookie.test.ts

## Purpose

Unit tests for the familiar-device cookie module. They verify what a device token vouches for, how multiple accounts share a single cookie (ordering, deduplication, capacity), and that no verification or cookie-setting occurs without the shared secret.

## Key elements

- **`requestFor(email?, cookie?)`** — builds a stub `Request` with an optional `DEVICE_COOKIE` value in `cookies` and an optional `email` in `body`.
- **`remembered(email, held?)`** — calls `rememberDevice` against a stub `Response`, then returns the cookie value that was set (i.e., the second argument to `response.cookie`).
- **`beforeEach`** — sets `NODE_DEVICE_COOKIE_SECRET` to a fixed test value via `setEnvironment` so every test starts with a valid secret.
- **`describe('a device cookie')`** — the single suite containing ten `it` blocks covering: case-insensitive email matching, negative verification, httpOnly + maxAge + opaque value, 5-account LRU eviction, idempotent repeat login, forged-token rejection vs. `presentsFailingDeviceCookie`, absent-cookie ≠ failing, no-secret behavior (both read and write paths), unparsed `request.cookies`, and missing `email` in the request body.

## Relationships

- **`src/modules/account/session/device-cookie.ts`** — the module under test. This file imports `DEVICE_COOKIE`, `holdsDeviceCookie`, `presentsFailingDeviceCookie`, and `rememberDevice` from it.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in `beforeEach` and in the "no secret" test to control `NODE_DEVICE_COOKIE_SECRET`.
- **`tests/support/stub.ts`** — provides `asStub`, used to construct mock `Request` and `Response` objects (express types) without a real HTTP server.

## Notes

- `presentsFailingDeviceCookie` is true only when a cookie is *present* but invalid; an entirely absent cookie returns false. This distinction is explicitly tested.
- The "no secret" test asserts both directions: `holdsDeviceCookie` returns false **and** `rememberDevice` never calls `response.cookie`.
- One test passes a request whose `cookies` property is `undefined` (never parsed by a middleware) to confirm the production code handles that without throwing.
- The cookie value is asserted to be opaque (`not.toContain('ada')`)—accounts are never readable in plaintext from the cookie.
