---
source: tests/integration/bad-bodies.test.ts
sha256: d67a81e522b01045744d8ce3810f43d5dacd0724669d07543a2ff61b19003e41
generated_at: 2026-09-23T20:03:20.252347+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/bad-bodies.test.ts

## Purpose

Integration test suite that pins the server's responses to request bodies the parser cannot or does not handle: oversized (413), malformed (400), unreadable charset/encoding (415), and the Express 5 edge case where no parser matched so `request.body` is `undefined`. Its core invariant is that a malformed body never produces a 5xx, and that the response to a bodyless/malformed login is identical whether or not the account exists (no information leakage via status code or body).

## Key elements

- **`OVERSIZED_BODY`** – A 200 kb JSON string, comfortably past the 100 kb `NODE_JSON_BODY_LIMIT`, used to trigger the 413 path.
- **`BODY_READING_ROUTES`** – Four `{method, path, authorize}` entries (`POST /account/login`, `POST /account/signup`, `PUT /account`, `POST /users`) identifying every route that destructures `request.body` without a prior Zod parse. Guarded routes carry an `authorize` async fn that returns a bearer token.
- **`describe('a body the parser refused')`** – Asserts 413/400/415 statuses and error codes; verifies 415 is declared in `openapi.yaml` for `POST /account/login`; asserts the error body does not leak body-parser internals (no "JSON", no "position").
- **`describe('a body express never parsed')`** – Parameterised over `BODY_READING_ROUTES`: sends `text/plain` and no-content-type bodies, asserting status < 500 and ≠ 401. Includes the enumeration property (known vs. unknown email get identical status + body) and a happy-path login regression.
- **`describe('hostile content in a well-formed body')`** – A 200-level nested JSON body (no server error) and a `__proto__` key that must not pollute `Object.prototype`.

## Relationships

- **`tests/support/http.ts`** – `api()` is the Supertest-style HTTP client used for every request; `authenticateAs(role)` mints a session and returns a bearer token, used by the two guarded entries in `BODY_READING_ROUTES`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module top-level (before any test) to provision and reset the test database.
- **`src/modules/users/tests/factories.ts`** – `createUser(overrides, role)` creates a verified user for the enumeration and happy-path tests; `PLAIN_PASSWORD` is the known password set by that factory.

## Notes

- **Express 5 vs 4:** When no body-parser matches, Express 5 leaves `request.body` as `undefined` (not `{}`). An unguarded destructure (`const {email} = req.body`) throws a synchronous `TypeError` that escapes any `.catch`. The fix is a per-site guard, not a blanket 400 middleware.
- **`BODY_READING_ROUTES` includes multipart routes** (`/account/signup`, `PUT /account`) because multer calls `next()` untouched for non-multipart content-types, so those routes still reach the unguarded destructure.
- **Enumeration test is the critical regression:** a 500 on one shape but 422 on another would still be "safe" only while neither depends on account existence. The test asserts full body equality, not just status.
- **Deliberate asymmetry:** a bodyless login returns 422, a wrong-password login returns 401. The file explicitly does *not* assert these are equal—`accountService.login` parses `LoginBody` itself, and the split (shape vs. credential) is intended.
- **415 contract test reads `openapi.yaml` directly** (via `readFileSync` + `yaml` parse) rather than going through the app, because the status and its declaration were added together and should fail together.
- **`setupTestDb()` runs at import time**, not in a `beforeAll` hook—any import-order side effect on the test DB is intentional.
