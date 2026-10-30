---
source: src/modules/account/tests/integration/cookie-hardening.test.ts
sha256: 2d5581c1fc2b342bf034f11ad20ba46b8f3150f742e6e03ed2d78c4a785c260f
generated_at: 2026-10-29T02:54:27.130464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/cookie-hardening.test.ts

## Purpose

Integration tests that verify the `__Host-session` refresh cookie is correctly hardened (prefix, flags, absence of `Domain`) and that the three cookie-only-authenticated surfaces — `POST /account/refresh`, `POST /account/logout`, and the two SSE streams — reject a foreign `Origin` header before performing any state change.

## Key elements

- **`FRONTEND`** – The single allowed origin (`https://shop.example`), set via `NODE_CORS_ORIGIN` in every `beforeEach`.
- **`login()`** – Local helper that creates a verified user via `createUser`, POSTs to `/account/login`, and returns the user, the raw response, and the extracted `__Host-session` cookie header.
- **`describe('the refresh cookie')`** – Asserts the `Set-Cookie` header carries `Secure`, `HttpOnly`, `Path=/`, no `Domain`, and that no separate `jwt` cookie is emitted.
- **`describe('POST /account/refresh')`** – Three cases: (1) accepts the frontend origin *and* a missing `Origin`; (2) returns 403 for a foreign origin and confirms no session row was superseded; (3) returns 405 with `Allow: POST` for a GET.
- **`describe('POST /account/logout')`** – Accepts the frontend origin (204); returns 403 for a foreign origin and verifies the session rows are still intact.
- **`describe('the SSE streams…')`** – Uses `it.each` over `/observability/events` and `/notifications/stream` to confirm a 403 on foreign `Origin` before the cookie is even consulted.

## Relationships

- **`tests/support/http.ts`** – `api()` is the supertest-style HTTP client used for every request.
- **`tests/support/cookies.ts`** – `setCookie(response, name)` extracts a specific `Set-Cookie` value; `cookieHeader(response, name)` builds a `Cookie:` header from a response.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_CORS_ORIGIN` per test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module scope to seed/point at the test database.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` supply a known, verified user for login.
- **`src/modules/account/tests/factories.ts`** – `sessionRowsOf(userId)` reads the `sessions` table to assert (or disprove) state changes after refresh/logout.

## Notes

- `setupTestDb()` runs at module import time, not inside a hook — the file relies on the database being ready before any test executes.
- The "no `Origin`" refresh case exists to guard the server-rendered / non-browser path where a request legitimately has no `Origin` header; the code under test must not conflate *missing* origin with *foreign* origin.
- The foreign-origin refresh test asserts on `sessionRowsOf` both *before* and *after* the request to prove no silent rotation occurred (checks length and absence of `supersededAt`).
