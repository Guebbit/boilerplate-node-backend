---
source: src/modules/account/tests/unit/device-cookie.test.ts
sha256: 8903ffef28ca7b02d9450d84883602ba44ce5b873ee0fe389252c2235acbeb2c
generated_at: 2026-10-14T09:19:55.714848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/device-cookie.test.ts

## Purpose

Unit tests for the familiar-device cookie logic in `device-cookie.ts`. Verifies the token's identity-verification rules (case-insensitive match, single-account binding, forgery rejection), the multi-account LRU cap (five, newest first), cookie attribute constraints (httpOnly, persistent, no plaintext email), and the hard dependency on `NODE_DEVICE_COOKIE_SECRET`.

## Key elements

- **`requestFor(email, cookie?)`** — builds a stub Express `Request` carrying an optional device cookie and an optional `email` in the body.
- **`remembered(email, held?)`** — invokes `rememberDevice` against a stub `Response` and returns the cookie value the response set.
- **`beforeEach`** — sets `NODE_DEVICE_COOKIE_SECRET` via `setEnvironment` so every test runs with a known secret.
- **Test suite (`describe('a device cookie', …)`)** — nine cases covering:
  - Case-insensitive email match and exclusion of other accounts.
  - httpOnly + positive maxAge + no email in cleartext.
  - Five-account LRU (6th pushes 1st out) and no duplication on repeat login.
  - Forged cookie → `holdsDeviceCookie` false, `presentsFailingDeviceCookie` true.
  - Absent cookie → `presentsFailingDeviceCookie` false.
  - No secret → verification fails and `rememberDevice` sets nothing.
  - Unparsed `request.cookies` (property missing) → no throw, treated as absent.
  - Request with no email → never vouched for, regardless of cookie.

## Relationships

- **`src/modules/account/session/device-cookie.ts`** — the module under test. Imports `DEVICE_COOKIE`, `holdsDeviceCookie`, `presentsFailingDeviceCookie`, `rememberDevice`.
- **`tests/support/environment.ts`** — provides `setEnvironment` used in `beforeEach` and in the "no secret" test to toggle the env var.
- **`tests/support/stub.ts`** — provides `asStub<T>` to cast plain objects into typed `Request`/`Response` without real Express instances.

## Notes

- The LRU cap is exactly **five** accounts; the test pushes a sixth and asserts the first is evicted. Any change to the cap requires updating that test.
- `presentsFailingDeviceCookie` is deliberately false when no cookie is present at all—distinguishing "no cookie" from "tampered cookie." New code should not conflate the two.
- The "no secret" test mutates the same environment object that `beforeEach` set; it relies on `setEnvironment` accepting `undefined` to unset the variable.
- The unparsed-cookies test passes a request with **no** `cookies` property at all (not just an empty object), guarding against a `TypeError` if `device-cookie.ts` accesses `req.cookies` without a null-check.
