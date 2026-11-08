---
source: tests/contract/write-methods.test.ts
sha256: 9c21b5ee8d9810a4d40f2fb969cfa9bb1d73d64a9fe78bc0e090caa8bf3e8355
generated_at: 2026-11-08T09:22:11.959861+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/write-methods.test.ts

## Purpose

Cross-module contract tests for the write-method standard (spec: `docs/api/write-methods.md`). Verifies rules that must hold for every module's mutations over real HTTP: empty-string rejection, content-type enforcement, idempotency-key replay, `Location` on 201, conditional requests (ETag / If-Match / 412), and 304 revalidation. Module-specific write rules belong in each module's own test files.

## Key elements

- **`WriteCase`** — type alias for a `[method, url, body]` tuple describing one HTTP write.
- **`EMPTY_STRING_CASES`** — 16 entries covering every optional free-text field with `minLength: 1` across modules (cart, addresses, orders, delivery, inventory, users, 2FA, password reset, tasks, products, webhooks). Each entry is expected to return **422**.
- **`sendKeyedContact`** — helper that POSTs a contact-request body under a fixed `Idempotency-Key`; used to verify bodiless-202 replay.
- **`describe('an empty string is never a stored value')`** — `it.each` over `EMPTY_STRING_CASES`; asserts 422 for every entry.
- **`describe('the body media type')`** — 3 tests: 415 for undeclared content type on PATCH, 200 for `application/merge-patch+json` on PATCH, 415 for merge-patch on PUT.
- **`describe('stock writes replay under an Idempotency-Key')`** — `receive` and `adjust` under a fixed key; second call returns `idempotent-replay: true` and identical body.
- **`describe('a bodiless 202 under an Idempotency-Key')`** — contact-request replay returns empty 202 both times.
- **`describe('a 201 names the new resource in Location')`** — asserts `Location` header for `/users/{id}`, `/webhooks/subscriptions/{id}`, and `/account` (signup).
- **`describe('conditional writes (RFC 9110 §13.1.1)')`** — 412 for stale `If-Match` on PATCH and DELETE; ETag present on both read and subsequent write; ETag changes after write.
- **`describe('a revalidating read answers 304 …')`** — `GET /users` (private cache) and `GET /products/facets` (public cache) return empty-body 304 on matching `If-None-Match`.

## Relationships

- **`tests/support/contract.ts`** — imported as `@tests/contract`; provides shared response-level assertions (e.g., ETag presence on 200, 412 must be declared, 304 must be declared) that complement the explicit status checks in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to prepare a clean database before any test runs.
- **`tests/support/http.ts`** — supplies `api()`, `authenticateAs()`, and `authenticateAsRole()` for every HTTP call.
- **`tests/support/shopper-routes.ts`** — `roleReaching({ path })` selects the correct auth role for each URL in the empty-string table, so the test doesn't hard-code a role.
- **`tests/support/ids.ts`** — `MISSING_ID` is substituted into resource URLs so a 422 (validation) is returned rather than a 404 (not found).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates a real product for idempotency and conditional-write tests.
- **`src/modules/users/tests/factories.ts`** — `PLAIN_PASSWORD` is the valid password constant used in the signup test.

## Notes

- **`MISSING_ID` is intentional.** It guarantees the server reaches validation (422) instead of short-circuiting with 404. If a new endpoint is added to `EMPTY_STRING_CASES`, use `MISSING_ID` in the URL unless a real resource is required.
- **The shared contract import enforces response shape.** A 200 that omits `ETag`, a 412 the spec never declared, or a 304 that stops being declared will fail via `@tests/contract` even if the explicit `expect(status)` passes. The two layers are independent.
- **Bug W8 reference.** The content-type test for PATCH with `text/plain` documents a historical bug where the body was silently parsed as `{}` and accepted by all-optional schemas.
- **Idempotency keys are hard-coded strings** (`stock-receive-1`, `located-replay-1`), not random, so the test is deterministic and the replay semantics are explicit.
- **Cache strategy coupling.** The 304 tests depend on `GET /users` mounting `privateNoCache` and `GET /products/facets` mounting `setCache`. If those strategies change, the 304 expectation may need updating.
