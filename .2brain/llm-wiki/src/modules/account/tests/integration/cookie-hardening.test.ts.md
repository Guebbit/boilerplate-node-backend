---
source: src/modules/account/tests/integration/cookie-hardening.test.ts
sha256: 47ed7a57343e365209e0b9a1bfb08d23347d49840fde472f8401c35d9dec3b87
generated_at: 2026-10-14T09:08:16.366367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/cookie-hardening.test.ts

## Purpose

Integration test that verifies the session cookie is issued with the full `__Host-` hardening profile (Secure, HttpOnly, Path=/, no Domain) and that every endpoint a lone cookie authenticates (`/account/refresh`, `/account/logout`, the two SSE streams) rejects a foreign `Origin` with 403 before touching session state. It also locks in that refresh is POST-only.

## Key elements

- **`login()`** (local helper) – Creates a verified user via the users factory, POSTs `/account/login`, and returns `{ user, response, cookie }` where `cookie` is the `__Host-session` value extracted from the response.
- **`FRONTEND`** (`'https://shop.example'`) – The single origin allowed by `NODE_CORS_ORIGIN` for this suite; injected via `setEnvironment` in `beforeEach`.
- **`describe('the refresh cookie')`** – Asserts the `Set-Cookie` header carries `Secure`, `HttpOnly`, `Path=/`, has **no** `Domain` attribute, and that no separate `jwt` cookie is set.
- **`describe('POST /account/refresh')`** – Confirms 200 for the allowed origin and for a missing `Origin` header; 403 (no rotation, no `supersededAt` mutation) for a foreign origin; 404 for a GET request.
- **`describe('POST /account/logout')`** – 200 from the allowed origin; 403 from a foreign origin with sessions still present.
- **`describe('the SSE streams…')`** – Parameterised over `/observability/events` and `/notifications/stream`: a foreign `Origin` yields 403 regardless of a valid cookie.

## Relationships

- **`tests/support/http.ts`** – Provides the `api()` supertest wrapper used for every request.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory test database before the suite runs.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_CORS_ORIGIN` per test.
- **`tests/support/cookies.ts`** – `setCookie` and `cookieHeader` read specific `Set-Cookie` / `Cookie` values from responses.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` build the test account.
- **`src/modules/account/tests/factories.ts`** – `sessionRowsOf` inspects DB rows to assert (or disprove) session mutation.

## Notes

- The foreign-origin rejection is asserted to happen **before** any session write: the test snapshots `sessionRowsOf` before and after and checks that no row gained a `supersededAt` timestamp.
- The "no `Origin` header" case on refresh is expected to succeed (200), so the guard is origin-based, not presence-based.
- The `noOrigin` test extracts the cookie from the first response's `Set-Cookie` header rather than re-logging in, so it exercises the second hop of the refresh flow.
- `setupTestDb()` is called at module top level (not in a `beforeEach`); it is idempotent across the suite.
