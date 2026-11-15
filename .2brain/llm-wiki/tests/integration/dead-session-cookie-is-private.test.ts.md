---
source: tests/integration/dead-session-cookie-is-private.test.ts
sha256: accef869baab5acdbf6c333ef9365d55aa44880493db387e01b148ba1c6c0768
generated_at: 2026-11-14T23:12:37.698972+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/dead-session-cookie-is-private.test.ts

## Purpose

Integration test verifying that a **dead session cookie** sent to a public, cacheable read endpoint (`GET /products`) in cookie session mode produces a `private, no-cache` response that also clears the cookie via `Set-Cookie`. This guards against a shared intermediary cache replaying the cookie-clear to every visitor (RFC 9111 §7.3). A second concern is confirmed: a visitor with *no* cookie still receives the shared `public, max-age=…` response, and the `Vary` header correctly includes/excludes `Cookie` depending on session mode.

## Key elements

- **`signedInWithCookie()`** – Creates a verified user, performs `POST /account/login`, extracts the `__Host-session=…` value from the response's `Set-Cookie` header, and returns `{ user, cookie }`.
- **`describe('GET /products in cookie mode')`**
  - *Dead-cookie test*: Seeds a product, signs in, calls `dropAllSessions`, then sends the stale cookie. Asserts 200, `Set-Cookie` contains `__Host-session=;`, and `Cache-Control` is `private, no-cache`.
  - *No-cookie test*: Asserts the same endpoint with no cookie returns `public, max-age=…` and sets no `Set-Cookie`.
- **`describe('Vary on a public read')`**
  - In cookie mode the `Vary` header must list `Cookie`.
  - In jwt mode (set via `setEnvironment`) it must not.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` resets the database before all tests. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_SESSION_MODE: … })` switches session strategy per test. |
| `tests/support/http.ts` | `api()` provides the supertest-style HTTP client used for every request. |
| `src/modules/users/tests/factories.ts` | `createUser` and `PLAIN_PASSWORD` seed a login-able account. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the resource the GET returns. |
| `src/modules/account/tests/factories.ts` | `dropAllSessions` invalidates the session server-side to simulate expiry. |

## Notes

- The cookie name is `__Host-session` (IETF Host-prefixed). The helper and assertions depend on this exact prefix; renaming the cookie in production would break the tests.
- `beforeEach` sets cookie mode globally, but the jwt `Vary` test overrides it inside the test body—subsequent tests in the same file still run in cookie mode because `setEnvironment` is called fresh each time via `beforeEach`.
- The test does **not** assert on `Set-Cookie` ordering or additional attributes (path, SameSite, etc.)—only the presence of the empty-value clear pattern.
