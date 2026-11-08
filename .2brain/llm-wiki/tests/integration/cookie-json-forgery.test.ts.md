---
source: tests/integration/cookie-json-forgery.test.ts
sha256: 43186835efbde198644b98e4c4aa6ff277fa39c727e3aa190a3cdca26433d191
generated_at: 2026-11-08T09:37:12.299040+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cookie-json-forgery.test.ts

## Purpose

Integration test that guards against **cookie JSON forgery**: `cookie-parser` automatically parses `j:`-prefixed cookie values into JS objects (e.g. `j:{"$ne":null}` → `{ "$ne": null }`). If downstream code treats the `jwt` cookie as a string, the injected object leaks into a Mongo filter or a string method call and causes a 500. This test ensures the application degrades gracefully to "no session" instead.

## Key elements

- **`describe('a j: cookie on a credential route')`** — single integration test case.
- **`setupTestDb()`** — called once before the suite; provisions an isolated database for the test.
- **`api()`** — test HTTP client; sends `POST /account/logout` with `Cookie: jwt=<encoded j:{"$ne":null}>` and asserts a `204` response.

## Relationships

- **`tests/support/setup-test-db.ts`** — imports `setupTestDb` to reset/seed the database before the test runs.
- **`tests/support/http.ts`** — imports `api`, the pre-configured HTTP client (base URL, auth helpers, etc.) used to issue the request.

## Notes

- The cookie value is `encodeURIComponent('j:{"$ne":null}')`. The `j:` prefix is what triggers `cookie-parser` to `JSON.parse` the value; the `$ne: null` payload is chosen because it is a valid Mongo operator, making the forgery scenario concrete.
- Expected status is **204** (not 200 or 500), reflecting the app's contract for a successful logout regardless of session state.
- The test exercises exactly one route (`/account/logout`). Other credential routes (login, me, etc.) are not covered here.
