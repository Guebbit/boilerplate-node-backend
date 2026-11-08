---
source: tests/contract/cookie-auth.test.ts
sha256: cd1ab5186e5bf375ffbc10f34fe9659aaded25c6f70513553a5e38a6e2dc9616
generated_at: 2026-11-08T09:19:08.089258+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/cookie-auth.test.ts

## Purpose

Contract test for the `cookie` session mode. While every other suite authenticates via `transport: 'bearer'`, this file exercises the `cookieAuth` alternative: it verifies that a browser-style request (no bearer token, just a `__Host-session` cookie) can read, can write from the declared CORS origin, and is refused with `403` on a write from a foreign origin. It sets the session mode itself, so it runs in both contract lanes.

## Key elements

- **`FRONTEND`** – the single allowed frontend origin (`https://shop.example`) used in the CORS-origin assertions.
- **`browserCookie()`** – helper that creates a verified user, POSTs to `/account/login` without a `transport` field, and extracts the `__Host-session` value from the `Set-Cookie` header.
- **`beforeEach`** – calls `setEnvironment` to pin `NODE_SESSION_MODE: 'cookie'` and `NODE_CORS_ORIGIN: FRONTEND` for every test.
- **`describe('a cookie-authenticated request')`** – three tests:
  - GET `/account` with the cookie → `200`.
  - PATCH `/account` with cookie + allowed `Origin` → `200`.
  - PATCH `/account` with cookie + foreign `Origin` → `403`.

## Relationships

- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); sets up the contract-test lane the file belongs to.
- **`tests/support/http.ts`** – provides the `api()` request helper used in every test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module load to prepare a clean database.
- **`tests/support/environment.ts`** – `setEnvironment()` is used in `beforeEach` to switch session mode and CORS origin per test.
- **`src/modules/users/tests/factories.ts`** – supplies `createUser` and `PLAIN_PASSWORD` for the login step in `browserCookie()`.

## Notes

- The test relies on the server responding with a `Set-Cookie` header whose value starts with `__Host-session=`; the `!` non-null assertion means a missing cookie is treated as a test bug, not a handled case.
- `beforeEach` resets environment vars on every test, so the file is self-contained and order-independent regardless of which lane (cookie vs. bearer) runs first.
- The foreign-origin 403 test is the only place in the test suite that exercises the `cookieAuth` + CORS-rejection path; all other suites use bearer auth and never hit it.
