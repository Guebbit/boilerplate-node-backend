---
source: src/modules/account/tests/integration/cookie-hardening.test.ts
sha256: 2d5581c1fc2b342bf034f11ad20ba46b8f3150f742e6e03ed2d78c4a785c260f
generated_at: 2026-11-08T04:35:09.494130+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/cookie-hardening.test.ts

## Purpose

Integration tests that pin the cookie-security contract for the account module: the refresh cookie must carry the `__Host-` prefix with the correct attribute set, `/account/refresh` must be POST-only, and every endpoint that authenticates via cookie alone (refresh, logout, the two SSE streams) must reject a foreign `Origin` with 403 before performing any session mutation.

## Key elements

- **`FRONTEND`** — the single allowed origin (`https://shop.example`), injected via `NODE_CORS_ORIGIN` in `beforeEach`.
- **`login()`** — helper that creates a verified user, POSTs `/account/login`, and returns `{ user, response, cookie }` where `cookie` is the extracted `__Host-session` value.
- **`describe('the refresh cookie')`** — asserts Set-Cookie flags: `Secure`, `HttpOnly`, `Path=/`, absence of `Domain=`, and absence of a separate `jwt` cookie.
- **`describe('POST /account/refresh')`** — three cases: accepts the frontend origin and no-`Origin`; returns 403 for a foreign origin *and* verifies no session row was rotated (`supersededAt` stays null, row count unchanged); returns 405 with `Allow: POST` for a GET.
- **`describe('POST /account/logout')`** — 204 for the frontend origin; 403 for a foreign origin with the session row still present.
- **`describe('the SSE streams a cookie alone authenticates')`** — `it.each` over `/observability/events` and `/notifications/stream`, asserting 403 on a foreign origin.

## Relationships

- **`tests/support/http.ts`** — `api()` is the HTTP client used for every request in this file.
- **`tests/support/cookies.ts`** — `setCookie()` reads a named `Set-Cookie` entry from a response; `cookieHeader()` extracts the raw cookie string for replay.
- **`tests/support/environment.ts`** — `setEnvironment()` sets `NODE_CORS_ORIGIN` per test to control the allowed-origin list.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provides a clean database for the integration run.
- **`src/modules/users/tests/factories.ts`** — `createUser()` builds a test user; `PLAIN_PASSWORD` is the known password.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf(userId)` queries the `sessions` table so tests can assert (or disprove) rotation and revocation.

## Notes

- Only **one** origin is configured (`NODE_CORS_ORIGIN` is a single value, not a comma-separated list), so the tests exercise exactly the allowed-vs-foreign binary.
- The "no Origin" refresh test re-extracts the cookie from the `set-cookie` response header via a `split(';', 1)[0]` fallback rather than reusing the `cookie` variable — this mirrors the production expectation that the *next* refresh call uses the cookie as the browser would send it (value only, no attributes).
- Foreign-origin rejection is asserted to happen **before** any write: tests check both row count and `supersededAt` to confirm no partial mutation leaked through.
