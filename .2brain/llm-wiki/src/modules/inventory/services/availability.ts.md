---
source: src/modules/inventory/services/availability.ts
source_sha256: f544875e03c6ee8e05749aaa723866e405a83acbe547aa41d941cfe64b859d01
context_sha256: 77958235916ace365d7f71db5bcdc169997f667a645d657e82c0151237d7779f
generated_at: 2026-11-22T05:21:53.620696+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/availability.ts

## Purpose
Answers what a shopper is told about a product's stock (`in_stock`, `out_of_stock`, `preorder`, `backorder`). It serves `GET /products/{id}/availability` and `GET /products/availability?id=…`, and owns the per-product Redis cache of that answer (`availability:<id>`, 60 s TTL).

## Key elements
- `getProductAvailability(productId, caller)`: single-product read. Returns a success response, or a 404 (`products.not-found`) when the product is unknown or hidden from the caller.
- `listProductAvailability(productIds, caller)`: batch read (the controller enforces the 100-id bound). Returns `{ items }` and silently omits products the caller may not see.
- `availabilityOfProducts(productIds)`: system-caller read with no permission check. It returns a `Map<id, Availability>` and omits ids with no product. Hidden or removed products read `out_of_stock`.
- `forgetAvailability(productIds)`: deletes the cache entries for the given ids (duplicates are deleted once). It is called after every stock write and on product term changes. It never rejects.
- `readMany` (internal): dedupes ids, loads entries, then filters per caller with `permitsOnRows(caller ?? anonymousCaller(), 'Product', ['read'])`. Output keeps the requested order.
- `entriesOf` (internal): one `getCacheValues` (MGET) for all ids, then `build` for the misses.
- `build` (internal): reads stock levels (`stockLevelRepository.findManyByProductIds`) and products (`productService.findManyByIds`) in parallel. It computes the result with `availabilityOf` and `BACKORDER_PROMISE_DAYS`, then writes each entry to the cache.
- `storedSchema` / `parseStored` (internal): zod validation of a cache entry. It holds `productId`, `availability`, an optional `availabilityDate`, `active` and `deletedAt` (ISO string or `null`). A missing, non-JSON or invalid entry is treated as a miss.

## Relationships
- **Cache** (`src/infrastructure/adapters/cache.ts`): uses `getCacheValues`, `setCacheValue` and `deleteCacheValues`. The adapter adds its own key prefix.
- **HTTP** (`src/infrastructure/http/response.ts`): uses `generateSuccess` and `generateReject`.
- **i18n** (`src/infrastructure/i18n/index.ts`): supplies `t(...)` for the 404 message.
- **Authorization** (`src/kernel/permissions.ts`, `src/kernel/ability.ts`): uses `anonymousCaller` and `permitsOnRows` to decide visibility.
- **Controllers** (`src/modules/inventory/controllers/get-product-availability.ts`, `src/modules/inventory/controllers/list-product-availability.ts`): call the two HTTP-facing functions.
- **Repository** (`src/modules/inventory/repository.ts`): `stockLevelRepository` supplies the stock levels.
- **Module wiring** (`src/modules/inventory/module.ts`): per the file header, clears entries via `forgetAvailability` on product terms-changed and product-deleted events.
- **Other inventory services** (`src/modules/inventory/services/holds.ts`, `reserve.ts`, `admin.ts`, `index.ts`): stock-writing services are the intended callers of `forgetAvailability`, and `index.ts` re-exports the service functions.
- **Delivery test** (`src/modules/delivery/tests/unit/fulfillment.test.ts`): a related test. Its use of this file is not visible here, presumably through `availabilityOfProducts`.

## Notes
- The cache key has no caller in it, so each entry stores `active` and `deletedAt`. Visibility is judged after the read, on hits and rebuilds alike. Staff (`display:Product`) see hidden or removed products, and everyone else, guests included, does not.
- The 60 s TTL covers what no event announces: a release or restock date passing, and a change of the shop's calendar day.
- A product with no stock-level row is treated as `available: 0` with no backorder allowance.
- `availabilityDate` is stored as a shop-day string via `shopDayOf`.
- `forgetAvailability` swallows failures on purpose, so the caller's follow-up work (a hold given back, a refund) is not skipped. The TTL bounds any stale entry. It leaves the `products` response cache alone, because that answer carries no stock.
- The `availabilityOfProducts` and `readMany` contracts differ: the HTTP reads omit hidden products, while the system read reports them as `out_of_stock`.
