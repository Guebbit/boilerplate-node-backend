---
source: tests/integration/bad-bodies.test.ts
sha256: 3f5d229a1ea11b20cabbf13afc13a4d1a8d9577459b9642ee256e7c4e1b2982b
generated_at: 2026-11-08T09:35:34.817589+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/bad-bodies.test.ts

## Purpose

Integration tests that assert every malformed or unexpected request body receives a sub-500 response with a correct status code (413, 400, 415, or the route's own 422) rather than a server fault. Covers three failure classes: bodies the JSON parser rejects (size, syntax, encoding), bodies Express never parses at all (wrong or missing content-type), and well-formed bodies with hostile content (excessive nesting, `__proto__`). Also pins the OpenAPI contract declaration for 415 on the operations that can return it.

## Key elements

- **`OVERSIZED_BODY`** — a 200 KB JSON string, deliberately past the 100 KB `NODE_JSON_BODY_LIMIT`, used for the 413 test.
- **`BODY_READING_ROUTES`** — array of the four routes (`POST /account/login`, `POST /account/signup`, `PUT /account`, `POST /users`) that read `request.body` without a prior Zod parse; each entry carries an optional `authorize` thunk for auth-guarded routes. Drives `it.each` tests in the "express never parsed" suite.
- **`describe('a body the parser refused')`** — asserts 413 (oversized), 400 (malformed JSON), 415 (unreadable charset / content-encoding), that 415 is declared in `openapi.yaml` for the answering operation, and that error messages do not leak parser internals.
- **`describe('a body express never parsed')`** — asserts 415 for `text/plain` bodies on every body-reading route (including a case-mismatched path), sub-500-and-not-401 for a missing content-type, the enumeration invariant (malformed login answers identically for a known and unknown email), and that a correct login still succeeds.
- **`describe('hostile content in a well-formed body')`** — asserts 400 (not 500) for a 200-level nested object and for a ~100 KB bracket-only body that previously overflowed recursive walkers.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` supertest client and `authenticateAs(role)` helper used to mint bearer tokens for the auth-guarded routes.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to seed a clean database before any test runs.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates a verified customer for the enumeration and happy-path tests; `PLAIN_PASSWORD` is the known password for that factory.
- **`tests/support/problem.ts`** — `withoutInstance` strips instance identifiers from response bodies so the enumeration test can compare two responses structurally without non-deterministic IDs.

## Notes

- Express 5 leaves `request.body` **undefined** (not `{}`) when no body-parser matches, so an unguarded destructure in route handlers throws a synchronous `TypeError`. The guard must live at each read site, not as a blanket 400 middleware.
- The enumeration test (known vs. unknown email both get the same 422) is the security-critical assertion: it prevents the server from leaking account existence through a different error shape.
- A bodyless login is intentionally **not** the same answer as a wrong-password login (422 vs. 401). The test file explicitly documents why this split is correct.
- The `text/plain` content-type is the standard trigger for the "express never parsed" path; `multer` on multipart routes is explicitly noted as providing no protection here because it calls `next()` untouched for non-multipart types.
- The 415 contract test reads `openapi.yaml` from `../../openapi.yaml` relative to the test file and asserts the 415 response is under the operation's own `responses` map (not just present in the document's shared components).
