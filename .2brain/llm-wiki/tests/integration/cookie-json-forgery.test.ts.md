---
source: tests/integration/cookie-json-forgery.test.ts
sha256: db8c4f5d2bfc656c414d8420230edde8aee43ae22218b11bc45dfa397484692b
generated_at: 2026-10-15T12:46:38.339502+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cookie-json-forgery.test.ts

## Purpose

Integration test verifying that a `j:`-prefixed cookie (which Express's `cookie-parser` auto-decodes into a JavaScript object) does not cause a 500 on a credential route. Without protection, an object like `{"$ne":null}` would leak into a Mongo filter or a string method call, crashing the handler.

## Key elements

- **`setupTestDb()`** — called at module scope to provision a clean test database before the suite runs.
- **`describe('a j: cookie on a credential route')`** — the single suite; currently contains one test.
- **`it('is read as "no session", not as an object: logout answers 200')`** — sends `POST /account/logout` with `Cookie: jwt=j:{"$ne":null}` (URL-encoded) and asserts the response status is **200**, confirming graceful "no session" handling rather than a 500.

## Relationships

- **`tests/support/setup-test-db.ts`** — exports `setupTestDb`, invoked once before the test to create/seed the test database.
- **`tests/support/http.ts`** — exports `api`, the HTTP client factory used to issue the `POST /account/logout` request with a custom `Cookie` header.

## Notes

- The attack vector is specific to Express's `cookie-parser` behavior: any cookie value starting with `j:` is `JSON.parse`d and delivered to the handler as an object instead of a string. The test encodes this via `encodeURIComponent('j:{"$ne":null}')` so the wire format is a valid `j:` payload.
- The test is scoped to the **logout** route; sibling credential routes (login, token-refresh) are not covered here.
