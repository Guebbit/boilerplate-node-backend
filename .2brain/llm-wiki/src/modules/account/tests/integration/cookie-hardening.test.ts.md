---
source: src/modules/account/tests/integration/cookie-hardening.test.ts
sha256: fd0960a1e61400ad4746003ba2820e255eef2846d8963ba08ae6fff97ff68ffe
generated_at: 2026-11-14T19:01:55.547037+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/cookie-hardening.test.ts

## Purpose

Integration tests that verify the session cookie is `__Host-` prefixed with the correct security attributes, and that every endpoint a cookie alone authenticates (refresh, logout, the two SSE streams) rejects a foreign `Origin` with a 403 before touching session state.

## Key elements

- **`FRONTEND`** — the single allowed origin (`https://shop.example`), injected via `NODE_CORS_ORIGIN` in `beforeEach`.
- **`login()`** — local helper: creates a verified user via `createUser`, POSTs `/account/login`, and returns `{ user, response, cookie }` where `cookie` is the extracted `__Host-session` header value.
- **`describe('the refresh cookie')`** — asserts the `Set-Cookie` header carries `Secure`, `HttpOnly`, `Path=/`, has no `Domain`, and that no `jwt` cookie is set.
- **`describe('POST /account/refresh')`** — three tests: (1) accepts the frontend origin *and* a missing `Origin`; (2) returns 403 for a foreign origin and leaves session rows unrotated (`supersededAt` stays null); (3) returns 405 for `GET` with `Allow: OPTIONS, POST`.
- **`describe('POST /account/logout')`** — 204 from the frontend origin; 403 + session rows intact from a foreign origin.
- **`describe('the SSE streams…')`** — `it.each` over `/observability/events` and `/notifications/stream`; both return 403 for a foreign origin regardless of a valid cookie.

## Relationships

- **`tests/support/http.ts`** — provides `api()`, the Supertest-style request builder used for every call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database once at module load.
- **`tests/support/environment.ts`** — `setEnvironment()` swaps `NODE_CORS_ORIGIN` per test.
- **`tests/support/cookies.ts`** — `setCookie(response, name)` reads a `Set-Cookie` value; `cookieHeader(response, name)` extracts the raw cookie string for replay.
- **`src/modules/users/tests/factories.ts`** — `createUser({ verifiedAt })` provisions a verified user; `PLAIN_PASSWORD` is the known hash input.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf(userId)` queries the session table directly for rotation assertions.

## Notes

- `setupTestDb()` runs at module scope (outside `beforeEach`), so the DB is prepared once per file, not per test.
- The "no Origin" refresh test re-extracts the cookie from the *response* `Set-Cookie` header (post-rotation) rather than reusing the original `cookie` variable, ensuring it tests the freshly minted session.
- The SSE-stream test is the only `GET`-based endpoint covered here; the 403 is expected to fire before the server inspects the cookie at all.
