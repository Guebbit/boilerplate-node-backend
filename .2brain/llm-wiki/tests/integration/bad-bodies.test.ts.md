---
source: tests/integration/bad-bodies.test.ts
sha256: 3f5d229a1ea11b20cabbf13afc13a4d1a8d9577459b9642ee256e7c4e1b2982b
generated_at: 2026-10-29T06:52:31.132941+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/bad-bodies.test.ts

## Purpose

Integration tests that verify every malformed or hostile request body receives a deterministic 4xx status (never a 500). They guard against the Express 5 regression where `request.body` is `undefined` (not `{}`) when no body-parser matched, causing unguarded destructures in controllers to throw synchronously before any `.catch` can intercept. The file also pins the contract declaration for app-level 415 responses and exercises the depth/size limits that prevent recursive walkers from overflowing.

## Key elements

- **`OVERSIZED_BODY`** — a 200 KB JSON string constructed to exceed `NODE_JSON_BODY_LIMIT` (default 100 KB). Used to trigger the 413 path.
- **`BODY_READING_ROUTES`** — array of the four routes (`POST /account/login`, `POST /account/signup`, `PUT /account`, `POST /users`) that destructure `request.body` without a prior Zod parse. Each entry carries an optional `authorize` thunk (for auth-guarded routes) so tests can prove the request reached the controller, not just the auth middleware.
- **`describe('a body the parser refused')`** — asserts 413 (oversized), 400 (malformed JSON), 415 (unreadable charset / content-encoding), verifies the 415 is declared under the operation's own `responses` in `openapi.yaml`, and checks that error messages never leak parser internals (e.g. the word "JSON" or a position offset).
- **`describe('a body express never parsed')`** — iterates `BODY_READING_ROUTES` asserting 415 on `text/plain` bodies, case-insensitive path matching (`/Account`), sub-500 + non-401 for a missing content-type, the enumeration property (malformed login returns identical status and body for a real vs. unknown email), and a happy-path regression (valid credentials still log in).
- **`describe('hostile content in a well-formed body')`** — asserts 400 (not 500) for nesting past the 32-level depth limit and for the 100 KB `[[[…]]]` body that previously overflowed recursive walkers.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to provision an isolated database before any test runs.
- **`tests/support/http.ts`** — `api()` provides the supertest-style HTTP client used for every request; `authenticateAs(role)` returns a `{ bearer }` token for the auth-guarded routes.
- **`src/modules/users/tests/factories.ts`** — `createUser()` creates a verified test user for the enumeration and happy-path tests; `PLAIN_PASSWORD` is the known password paired with that user.
- **`tests/support/problem.ts`** — `withoutInstance()` strips the volatile `instance` identifier from `application/problem+json` bodies so the enumeration test can compare two responses for structural equality.

## Notes

- The "no content-type" case deliberately expects the *route's own* answer (e.g. 422 for login), **not** a blanket 400 or 415. The guard is at each controller read site, not a middleware.
- The enumeration test asserts that a malformed login is indistinguishable to an attacker whether the email exists or not, but explicitly does **not** assert that a bodyless login matches a wrong-password login. The 422-vs-401 split is intentional: the *shape* of a guess is not a secret, only account existence is.
- The 415 contract test reads `openapi.yaml` from disk and checks the status lives under the specific operation's `responses` map (not just somewhere in the file), because a component declared at the top level passes even if the merge that attaches it to the operation never ran.
- The 415 charset/encoding tests use real `Content-Type` header values rejected by the actual `body-parser`, not a hand-set `.status` on an `Error`, to exercise the real parser code path.
- `charset=utf-7` is accepted by body-parser and `charset=utf-32` decodes to nonsense (400, not 415); these are documented in the test comments to prevent a future "fix" from breaking them.
