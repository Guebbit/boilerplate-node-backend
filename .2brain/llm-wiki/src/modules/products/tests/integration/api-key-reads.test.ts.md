---
source: src/modules/products/tests/integration/api-key-reads.test.ts
sha256: 3b1e0bef5ef1e2919869cceb468339476da6a01f67bc6f327b40bc0fa581ba86
generated_at: 2026-11-08T07:50:16.391339+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/api-key-reads.test.ts

## Purpose

Integration tests verifying that an `sk_…` API key, when used to call the product endpoints, receives the same visibility and scoping rules as a session with identical permissions. Specifically, it asserts that scope-dependent fields (drafts, soft-deleted rows, translations) appear or disappear based on the key's granted scopes, and that the cache middleware correctly distinguishes a key caller from an anonymous guest so a wider answer is never stored under the guest's cache key.

## Key elements

- **`bearerOf(secret)`** – Local helper that formats a credential secret into an `Authorization: Bearer …` header value.
- **`titlesAt(secret)`** – Helper that GETs `/products`, extracts the `items[].title` array, and returns it sorted. Used by the list-visibility tests.
- **`describe('GET /products/:id with an api key')`** – Three tests confirming a soft-deleted product returns 200 for `display:Product`, 404 for a key lacking that scope, and that a published product is still visible to an unrelated scope.
- **`describe('GET /products/:id: translations follow read:Translation')`** – Four tests covering: translations present for `read:Translation` vs absent for a guest; the key's response must not seed the guest's cached entry; and the `cache-control` header must be `private` (not shared with the anonymous tier).
- **`describe('GET /products with an api key')`** – Two tests confirming the list endpoint includes drafts for `display:Product` and only active products otherwise.
- **`describe('the cache scope of a key caller')`** – Two unit-level assertions calling `hasAnonymousReadScope(productService.callerScope, callerAs(…))` to lock in that an admin-scoped caller is *not* treated as anonymous while a customer-scoped one *is*.

## Relationships

- **`@tests/http` → `api`** – Provides the supertest-style HTTP client used for every request in this file.
- **`@tests/setup-test-db` → `setupTestDb`** – Called once at module scope to reset/provision the test database before any test runs.
- **`@tests/credentials` → `credentialHolding`** – Mints a throwaway `sk_…` secret bound to a specific scope list; the file's primary fixture for "a key with scopes X."
- **`@modules/products/tests/factories` → `createProduct`** – Inserts a product row with the desired `active`/`deletedAt` state.
- **`@tests/callers` → `callerAs`** – Produces a caller context object (e.g. `'admin'`, `'customer'`) for the `hasAnonymousReadScope` unit assertions.
- **`@kernel/access/query` → `hasAnonymousReadScope`** – The predicate under test in the cache-scope block; determines whether a given caller's scope is equivalent to the public baseline.
- **`../../services` → `productService`** – Imported solely to read `productService.callerScope`, the function the cache middleware consults to decide whether a response is guest-equivalent.

## Notes

- `setupTestDb()` is invoked at **module top level**, not inside a `beforeAll`, so it runs once when the test file loads.
- The last describe block ("the cache scope of a key caller") makes no HTTP requests; it asserts the pure predicate `hasAnonymousReadScope` directly, so failures there point to a misconfigured `productService.callerScope` rather than a routing or serialization bug.
- The translation-cache test ("never lets that key seed the guest's cached answer") relies on request ordering: the keyed GET must complete *before* the guest GET so that any cache pollution would be observable.
- Scope strings are plain arrays (`['display:Product']`, `['read:Translation']`); there is no wildcard or hierarchical matching exercised here.
