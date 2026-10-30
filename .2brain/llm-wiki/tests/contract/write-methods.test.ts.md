---
source: tests/contract/write-methods.test.ts
sha256: 5bfa84a0b7ad058cc8d67e370d49bb227c17a297f743a7890002b00ba10fa160
generated_at: 2026-10-29T06:41:43.564634+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/write-methods.test.ts

## Purpose

Cross-module HTTP contract tests for write-method invariants defined in `docs/api/write-methods.md`. It pins rules that hold across every module—empty-string rejection (422), Content-Type enforcement (415), idempotent replay, `Location` on 201, conditional `If-Match`/`ETag` (RFC 9110 §13.1.1), and `If-None-Match` 304 revalidation—by sending real HTTP requests against a live test database. Module-specific write rules live in each module's own tests.

## Key elements

- **`WriteCase`** (type) — readonly tuple `[method, url, body]` describing one HTTP write request.
- **`EMPTY_STRING_CASES`** — 16-tuple array of write cases where exactly one optional free-text field is `''`; each must yield 422. Uses `MISSING_ID` in URLs because validation must fail before ID resolution.
- **`sendKeyedContact`** — helper that POSTs to `/tickets` with a fixed `Idempotency-Key: located-replay-1` to simulate a client retry.
- **`describe('an empty string is never a stored value')`** — parameterised 422 assertions over `EMPTY_STRING_CASES`.
- **`describe('the body media type')`** — verifies 415 for undeclared `Content-Type` on PATCH, 200 for `application/merge-patch+json`, and 415 for merge-patch on PUT.
- **`describe('stock writes replay under an Idempotency-Key')`** — sends the same receive/adjust twice under one key; asserts second response carries `idempotent-replay: true` and identical body.
- **`describe('a 201 names the new resource in Location')`** — asserts `Location` header on `/users`, `/tickets`, `/webhooks/subscriptions`, and `/account/signup`; also checks replayed `Location` on idempotent retry.
- **`describe('conditional writes (RFC 9110 §13.1.1)')`** — stale `If-Match` → 412 with `PRECONDITION_FAILED`; matching `If-Match` → 200 with a new `ETag`.
- **`describe('a revalidating read answers 304')` / `'a public cached read answers 304 too'`** — `If-None-Match` on private (`/users`) and public (`/products/facets`) reads returns empty-body 304 with the same ETag.

## Relationships

- **tests/support/contract.ts** — imported as `@tests/contract`; its shared response middleware automatically fails responses missing a spec-declared header (e.g., `ETag`) or containing an undeclared status (e.g., 412 on a non-conditional op), so this file's assertions are reinforced by that layer.
- **tests/support/setup-test-db.ts** — `setupTestDb()` is called at module scope to seed/truncate the test database before any test runs.
- **tests/support/http.ts** — provides `api()` (supertest instance), `authenticateAs`, and `authenticateAsRole` for every request.
- **tests/support/shopper-routes.ts** — `roleReaching({ path })` resolves the minimum role that can hit a given URL, used to obtain the right bearer token per case.
- **tests/support/ids.ts** — exports `MISSING_ID`, a placeholder ID that is intentionally absent from the DB, ensuring 422 fires at validation before any lookup.
- **src/modules/products/tests/factories.ts** — `createProduct` seeds a real product row for the conditional-write and idempotency tests.
- **src/modules/users/tests/factories.ts** — `PLAIN_PASSWORD` provides the known-plaintext credential for the signup Location test.

## Notes

- `setupTestDb()` runs once at import time (module scope), not inside a `describe`/`beforeAll`; the DB state is shared across all describes in this file.
- The empty-string table deliberately keeps every other field valid so the 422 is attributable solely to the empty string, not a missing required field.
- The 304 sections include inline comments explaining *why* the shared contract check would fail if the spec stopped declaring 304 for that route—these are guardrails, not redundant assertions.
- Idempotency tests use **fixed** keys (`stock-receive-1`, `stock-adjust-1`, `located-replay-1`); running the file twice against the same DB would replay rather than create.
