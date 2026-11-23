---
source: src/modules/products/tests/integration/api-key-reads.test.ts
source_sha256: dea552e46d37fe1c3e9dfbf6f1a5d8d27ad792e09eadd28784231e9f6f8a2d1a
context_sha256: 714b288f1224f0aced50d5bbe4041e799ac0a3b831576b648f85768dd2c91c3a
generated_at: 2026-11-22T07:15:29.848696+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/api-key-reads.test.ts

## Purpose
Integration tests showing that an `sk_...` API key reads products the same way a session with the same permissions does. `callerScope` takes `request.caller`, which both sessions and keys resolve to. A key holding `display:Product` therefore sees drafts and soft-deleted rows. A key without it sees only the published catalogue a guest sees.

## Key elements
- `bearerOf(secret)`: builds the `Bearer <secret>` `Authorization` header value.
- `titlesAt(secret)`: calls `GET /products` with the key and returns the sorted item titles.
- `GET /products/:id with an api key`: checks a soft-deleted product is 200 for `display:Product` and 404 for a `read:User` key. It also checks a published product is still 200 for a key minted for something else.
- `GET /products/:id: translations follow read:Translation`:
  - A `read:Translation` key gets all languages in `translations`, and a guest gets no `translations` property.
  - After the key reads a product, a guest's request for it must still return no `translations`, so the key's wider answer must not seed the guest's cached entry.
  - The keyed response has a `private` `cache-control` header.
- `GET /products with an api key`: a `display:Product` key lists drafts and live products. A key without it lists only published ones.
- `the cache scope of a key caller`: unit-style checks of `hasAnonymousReadScope(productService.callerScope, callerAs(...))`. It is `false` for `admin` (holds `display:Product`) and `true` for `customer` (public baseline only).

## Relationships
- `tests/support/http.ts`: `api()` issues the requests.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to prepare the test DB.
- `tests/support/credentials.ts`: `credentialHolding` returns an API key secret holding the listed permissions.
- `tests/support/callers.ts`: `callerAs('admin' | 'customer')` builds callers for the cache-scope tests.
- `src/modules/products/tests/factories.ts`: `createProduct` seeds products with `title`, `active` and `deletedAt`.
- `src/kernel/access/query.ts`: provides `hasAnonymousReadScope`.
- `src/modules/products/services/index.ts`: provides `productService`, whose `callerScope` is passed to `hasAnonymousReadScope`.

## Notes
- The cache middleware shares the guest's cache entry only when `hasAnonymousReadScope` is true. A key that reads more than a guest must make it false, or its answer would be stored under the guest's key.
- A `read:Translation` key reads the same rows as a guest, so only the field-level check keeps its translations out of the guest's cached entry.
