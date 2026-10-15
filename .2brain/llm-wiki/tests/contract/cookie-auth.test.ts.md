---
source: tests/contract/cookie-auth.test.ts
sha256: cd1ab5186e5bf375ffbc10f34fe9659aaded25c6f70513553a5e38a6e2dc9616
generated_at: 2026-10-15T12:32:12.028658+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/cookie-auth.test.ts

## Purpose

Contract test for the **cookie-auth** alternative. Every other suite authenticates via `transport: 'bearer'`; this file is the only one that exercises the `cookieAuth` path — a browser-like client that carries a session cookie instead of a bearer token. It asserts the two obligations declared for that mode: reads succeed, and unsafe methods (PATCH) from a foreign origin receive the declared `403`.

## Key elements

- **`FRONTEND`** — constant (`https://shop.example`); the single allowed CORS origin for every assertion in this file.
- **`browserCookie()`** — creates a user, POSTs to `/account/login` *without* a `transport` header (simulating a browser), and extracts the `__Host-session` value from the `Set-Cookie` header.
- **`beforeEach`** — sets `NODE_SESSION_MODE: 'cookie'` and `NODE_CORS_ORIGIN: FRONTEND` via `setEnvironment` so each test runs in cookie mode.
- **Three test cases** — read (200), write from allowed origin (200), write from foreign origin (`https://evil.example`, 403).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); enrolls this file in the contract test lane. The doc comment notes the file runs in **both** lanes because it sets the session mode itself. |
| `tests/support/http.ts` | Provides the `api()` request helper used for every HTTP call. |
| `tests/support/environment.ts` | `setEnvironment` configures `NODE_SESSION_MODE` and `NODE_CORS_ORIGIN` per test. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module scope to prepare a clean database. |
| `src/modules/users/tests/factories.ts` | `createUser` and `PLAIN_PASSWORD` create the user that signs in. |

## Notes

- **No bearer transport.** The login call deliberately omits the `transport` header; adding one would break the point of the test.
- **Cookie extraction is positional.** `browserCookie` does `.find(c => c.startsWith('__Host-session='))!` and splits on `;`. If the server ever changes the cookie name or omits it, the test crashes with a non-null-assertion error rather than failing a readable assertion.
- **Origin is hardcoded per file.** `FRONTEND` is not read from a shared config; if the allowed origin changes elsewhere, only this constant and the foreign-origin test case need updating.
