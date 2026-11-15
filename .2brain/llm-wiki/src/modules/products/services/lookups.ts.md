---
source: src/modules/products/services/lookups.ts
sha256: af35a1233bcf1ae5db2bbe23857b96ae10dacc35b7c9b3e2d67f28fcaaee3152
generated_at: 2026-11-14T21:28:03.749796+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/lookups.ts

## Purpose

Read-only lookup service for the products collection. It is the "door" through which sibling modules (inventory, orders, cart, wishlist, sitemaps) access product data, translation content, and public catalogue listings without reaching into the repository directly. It also provides the single sanctioned write (`syncStockCache`) for mirroring inventory's stock counters onto a product document.

## Key elements

- **`findByIdRaw` / `findByIdRawScoped`** – Plain, untransformed document reads; the scoped variant hides soft-deleted or non-displayable products based on the caller's permission scope.
- **`isLive`** – Boolean check that a product exists and is not soft-deleted (used by late event handlers before acting).
- **`findPublicById`** – Returns the publicly visible product or `null`; the single read used by cart and wishlist.
- **`findManyByIds`** – Batch read by id array in one round trip; bypasses the `findAll` default cap.
- **`countPublic`** – Counts publicly visible products among a given id set, with optional `excludePreorders` filter (excludes items on sale before their release date).
- **`syncStockCache`** – Writes inventory's committed counters onto the product doc inside a transaction; detects a `becameBuyable` transition and enqueues a `PRODUCT_BUYABLE_AGAIN` outbox event.
- **`translationsWithFallback`** – Returns all locale → field rows (drafts included) for admin/editor reads, filling the fallback-locale slot from the product's own columns if no translation row exists.
- **`titlesOf` / `titlesById`** – Returns only *served* (non-draft) locale titles for durable, customer-facing messages; `titlesById` accepts an id and returns `{}` for a missing/hard-deleted product.
- **`listPublicPage` / `countListed`** – Paginated public catalogue listing (id + last-change date) and total count, sized for sitemap generation.
- **`withFallbackRow`** *(private)* – Merges a product's own `title`/`description` columns into the fallback-locale slot of a translation map.

## Relationships

- **`src/modules/products/repository.ts`** – Every public function delegates to `productRepository`; this file is a thin service layer over that repository.
- **`src/modules/products/domain/buyable.ts`** – `syncStockCache` calls `becameBuyable` to detect the stock-level flip.
- **`src/modules/products/events.ts`** – Supplies the `PRODUCT_BUYABLE_AGAIN` event name used in the outbox enqueue.
- **`src/kernel/outbox.ts`** – `syncStockCache` calls `enqueueOutboxEvent` and `nudgeOutbox` to deliver the buyable-again notification.
- **`src/kernel/translation.ts`** – `translationsWithFallback` and `titlesOf` call `readAllTranslations` / `readServedTranslations` to fetch locale rows.
- **`src/infrastructure/i18n/index.ts`** – `withFallbackRow` calls `getFallbackLocale` to determine which locale the product's own columns represent.
- **`src/infrastructure/runtime/database.ts`** – `syncStockCache` wraps its read-modify-write in `withTransaction`.
- **`src/infrastructure/persistence/create-repository.ts`** – Imports `toObjectId` for id conversion in `countPublic`.
- **`src/modules/products/model.ts`** – Imports the `ProductDocument` type used throughout.
- **`src/types/index.ts`** – Imports `ProductTranslationFields` for return-type annotations.
- **`src/modules/products/services/index.ts`** – Barrel that re-exports this module alongside sibling services (`read`, `remove`).

## Notes

- **Raw vs. transformed reads:** `findByIdRaw` returns the stored document untouched; `getById` (in `read.ts`) applies scope/transform logic. Inventory and orders intentionally use the raw form.
- **`syncStockCache` is the sole writer:** Inventory is the only legitimate caller. This function mirrors values and detects the buyable flip but never decides whether the underlying stock change is legal.
- **Presence-check idiom:** `withFallbackRow` uses `'description' in fields` rather than `=== undefined` because the index signature types every key as `string`, making the `undefined` comparison unreliable at the type level.
- **Draft isolation:** `titlesOf` deliberately copies only *served* translations so that a product's draft title can never leak into customer-facing emails, exports, or event payloads.
- **`findManyByIds` cap bypass:** The call goes through `findByIds`, which is not subject to the `findAll` default limit; a malformed ObjectId will reject the promise rather than return a partial array.
