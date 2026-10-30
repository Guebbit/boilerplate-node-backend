---
source: tests/integration/cookie-json-forgery.test.ts
sha256: 43186835efbde198644b98e4c4aa6ff277fa39c727e3aa190a3cdca26433d191
generated_at: 2026-10-29T06:54:08.664204+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/cookie-json-forgery.test.ts

## Purpose

Integration test that guards against a cookie-parser JSON-injection path: a `j:`-prefixed cookie value is deserialized into a JavaScript object by `cookie-parser`, so a forged `jwt=j:{"$ne":null}` arrives at the `/account/logout` controller as an object rather than a string. The test verifies the logout handler tolerates this and returns `204` instead of crashing with a 500 (e.g., from passing the object into a Mongo filter or calling a string method on it).

## Key elements

- **`setupTestDb()`** — invoked once at module level to seed/reset the test database before the suite runs.
- **`api()`** — returns a pre-configured `supertest`-style client bound to the app under test; used to issue the HTTP request.
- **Test: `is read as "no session", not as an object: logout answers 200`** — POSTs `/account/logout` with header `Cookie: jwt=j%3A%7B%22%24ne%22%3Anull%7D` (the `encodeURIComponent` of `j:{"$ne":null}`) and asserts `response.status` is `204`.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, called at the top of the file to prepare database state for the single test case.
- **`tests/support/http.ts`** — provides `api`, the HTTP client used to issue the forged-cookie request against the running app.

## Notes

- The `j:` prefix is a `cookie-parser` convention: any cookie whose value starts with `j:` has the remainder `JSON.parse`d, so the downstream handler receives a raw object. This is the attack vector the test exercises.
- The test description string says "logout answers 200" but the actual assertion checks `204`; treat the assertion as authoritative.
- The test is intentionally minimal (one case) because it targets a single, narrow class of 500 caused by type confusion on one credential route.
