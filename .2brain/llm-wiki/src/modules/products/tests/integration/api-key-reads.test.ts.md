---
source: src/modules/products/tests/integration/api-key-reads.test.ts
sha256: 3b1e0bef5ef1e2919869cceb468339476da6a01f67bc6f327b40bc0fa581ba86
generated_at: 2026-10-29T05:31:42.466765+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/api-key-reads.test.ts

## Purpose

Integration tests verifying that `sk_...` API-key credentials produce the same read-visible data as an equivalent session: soft-deleted and draft product rows, the `translations` field, and cache-scope isolation relative to the anonymous guest.

## Key elements

- **`bearerOf(secret)`** – formats a secret into the `Authorization: Bearer …` header value.
- **`titlesAt(secret)`** – performs a `GET /products` list call and returns the sorted array of item titles from the `{ items: [{ title }] }` envelope.
- **`describe('GET /products/:id with an api key')`** – three cases: a key with `display:Product` gets 200 on a soft-deleted product; a key without it gets 404; a key with unrelated scope still gets 200 on a published product.
- **`describe('GET /products/:id: translations follow read:Translation')`** – three cases: key with `read:Translation` sees `translations`; guest does not; a prior keyed request must not seed the guest's cached entry; keyed response carries a `private` cache-control header.
- **`describe('GET /products with an api key')`** – two cases on the list endpoint: `display:Product` key sees both draft and live; a key with only `read:User` sees only live.
- **`describe('the cache scope of a key caller')`** – two unit-level assertions that `hasAnonymousReadScope(productService.callerScope, caller)` is `false` for an admin caller and `true` for a customer caller.

## Relationships

- **`src/kernel/access/query.ts`** – provides `hasAnonymousReadScope`, used directly in the cache-scope block to confirm the product service's `callerScope` distinguishes privileged from anonymous callers.
- **`src/modules/products/services/index.ts`** – provides `productService`; the test reads its `callerScope` property to assert cache-scope behavior.
- **`src/modules/products/tests/factories.ts`** – provides `createProduct`, the sole way test products (published, draft, soft-deleted) are seeded.
- **`tests/support/callers.ts`** – provides `callerAs(scope)`, used to construct a caller object for the `hasAnonymousReadScope` assertions.
- **`tests/support/credentials.ts`** – provides `credentialHolding(scopes)`, mints an `sk_` key with the given scope set for each HTTP test.
- **`tests/support/http.ts`** – provides the `api()` request helper (supertest-style) used for every `GET` call.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()`, called once at module top to initialise the in-memory database before any test runs.

## Notes

- `setupTestDb()` is invoked at the top level of the module (not inside a `beforeAll`), so it runs exactly once for the whole file.
- The translations tests rely on request *ordering*: the keyed request is issued before the guest request to prove the guest cache entry is not polluted. Tests are sequential by default in the runner.
- The list-endpoint tests assume the response body wraps results as `{ items: [...] }`; the `titlesAt` helper casts to that shape and will throw at runtime if the contract changes.
- The cache-scope block (`describe('the cache scope…')`) is a pure unit assertion (no HTTP, no DB) co-located here for topical proximity rather than as a separate unit-test file.
