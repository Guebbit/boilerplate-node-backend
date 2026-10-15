---
source: src/modules/products/tests/integration/api-key-reads.test.ts
sha256: 995d3b1dcddc45874a5ea412ef92c58f1ec1fa564a248d2e1bcc005cbffc5aa7
generated_at: 2026-10-15T11:47:14.408301+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/api-key-reads.test.ts

## Purpose

Integration tests that verify an API key (`sk_…` secret) inherits the same read-visibility semantics as a session credential: a key scoped with `products.any.read` sees drafts and soft-deleted products, while a key without that scope sees only the published catalogue. Also asserts that the cache-scope predicate correctly distinguishes elevated callers from guests to prevent wider results from being stored under a guest cache key.

## Key elements

- **`bearerOf(secret)`** – Formats a secret into the `Authorization: Bearer …` header value.
- **`titlesAt(secret)`** – Hits `GET /products`, unwraps `body.data.items`, and returns a sorted array of product titles for assertion convenience.
- **`describe("GET /products/:id with an api key")`** – Three cases: soft-deleted visible to `products.any.read` key (200), soft-deleted hidden from a non-product-scoped key (404), published product visible to any authenticated key (200).
- **`describe("GET /products with an api key")`** – Two cases: draft + live both listed for `products.any.read` key; only live listed for a key lacking that scope.
- **`describe("the cache scope of a key caller")`** – Two pure-function assertions that `hasAnonymousReadScope(callerScope, callerAs(…))` is `false` for an admin caller and `true` for a customer caller.

## Relationships

- **`src/kernel/access/query.ts`** – Provides `hasAnonymousReadScope`, the predicate tested in the cache-scope block to ensure elevated callers don't share the guest cache entry.
- **`src/modules/products/services/index.ts`** – Exports `callerScope`, the scope-resolver function whose behavior is exercised by the cache-scope tests.
- **`src/modules/products/services/read.ts`** – The read service behind the `GET /products` and `GET /products/:id` endpoints; these tests exercise its filtering logic end-to-end.
- **`src/modules/products/tests/factories.ts`** – Supplies `createProduct` for seeding products with specific `active` / `deletedAt` states.
- **`tests/support/callers.ts`** – Supplies `callerAs` to construct simulated caller objects for the cache-scope assertions.
- **`tests/support/credentials.ts`** – Supplies `credentialHolding` to mint an API key secret bound to a specific permission list.
- **`tests/support/http.ts`** – Supplies the `api()` supertest-style client used for all HTTP assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module top level to prepare the test database before any suite runs.

## Notes

- `setupTestDb()` is invoked at the module top level (not in `beforeAll`/`beforeEach`), so all tests in this file share a single database instance; tests must be self-contained in what they seed.
- The cache-scope tests are pure unit assertions (no HTTP round-trip) embedded in an otherwise integration-level file; they guard against a cache-pollution regression where a `products.any.read` answer would be written under the anonymous guest cache key.
- The file's doc comment explicitly states the design contract: `callerScope(request.caller)` is the single resolution point shared by both sessions and API keys, so tests here validate that contract rather than key-specific code.
