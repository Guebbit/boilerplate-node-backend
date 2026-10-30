---
source: src/modules/products/services/lookups.ts
sha256: 8622b8bf08edb5975c677f6ef0597a942440005b46d76c65e9450c6ee7ae4fee
generated_at: 2026-10-29T05:29:14.569414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/lookups.ts

## Purpose

The read-only lookup service for the products module. It is the single door through which sibling modules (inventory, orders, cart, wishlist, delivery) read product data, so they never touch the repository directly. The one exception is `syncStockCache`, which lets inventory mirror its stock counters onto the product document so a catalogue read needs no join.

## Key elements

- **`findByIdRaw`** / **`findByIdRawScoped`** — untransformed product read; the scoped variant narrows the result by the caller's permission scope (hidden/removed products appear as `null`).
- **`isLive`** — boolean check that a product exists and is not soft-deleted (used by late event handlers before acting).
- **`findPublicById`** — single publicly visible product, or `null`.
- **`findManyByIds`** — batch read by id list in one round trip.
- **`countPublic`** — count of publicly visible products among a given id set; optional `excludePreorders` excludes not-yet-released items.
- **`syncStockCache`** — the sole write: copies inventory's `onHand`/`reserved` counters onto the product document inside a transaction; if the flip to buyable is detected via `becameBuyable`, enqueues `PRODUCT_BUYABLE_AGAIN` to the outbox and nudges it.
- **`translationsWithFallback`** — all translation rows (drafts included) plus the product's own `title`/`description` columns filling the fallback-locale slot when no row exists.
- **`titlesOf`** — served-locale titles only (drafts excluded), locale → title map; safe to embed in outbox messages.
- **`titlesById`** — `titlesOf` by id; returns `{}` for a missing/hard-deleted product; works for soft-deleted ones.
- **`listPublicPage`** / **`countListed`** — paginated public catalogue listing and total count (sitemap support).
- **`withFallbackRow`** *(private)* — merges translation rows with the product's own columns for the fallback locale.

## Relationships

- **`../repository.ts`** — every read and the `syncStockCache` write delegate to `productRepository`; also supplies `ListedProduct` and `StockCounters` types.
- **`@infrastructure/persistence/create-repository`** — imports `toObjectId` for id conversion in batch reads.
- **`@infrastructure/i18n`** — imports `getFallbackLocale` to fill the missing fallback-locale slot in translations.
- **`@kernel/translation`** — calls `readAllTranslations` (drafts) and `readServedTranslations` (served locales only).
- **`@kernel/outbox`** — `syncStockCache` calls `enqueueOutboxEvent(PRODUCT_BUYABLE_AGAIN, …)` and `nudgeOutbox()`.
- **`@modules/products/domain/buyable.ts`** — `syncStockCache` calls `becameBuyable(before, after)` to detect the state flip.
- **`@modules/products/events.ts`** — imports the `PRODUCT_BUYABLE_AGAIN` constant.
- **`@infrastructure/runtime/database`** — `syncStockCache` wraps its write in `withTransaction`.
- **`@types`** — imports `ProductTranslationFields` for the translation-map shape.
- **`../model.ts`** — imports `ProductDocument` type.
- **`services/index.ts`** — re-exports this module's public API to the rest of the codebase.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — exercises the read paths here in delivery fulfilment tests.

## Notes

- `findManyByIds` (and `countPublic`) wrap the body in `Promise.resolve().then(…)` so that a synchronous throw from `toObjectId` on a malformed id becomes a rejected promise, matching the convention in `orders/services/crud.ts`. Callers uniformly treat the return as a `Promise`.
- `syncStockCache` is the only mutation in this file. Its only legitimate caller is the inventory module; the file never decides whether a stock change is legal.
- `titlesOf` deliberately uses `readServedTranslations`, not `readAllTranslations`, so draft-locale titles can never leak into outbox messages, streams, or emails.
- `withFallbackRow` uses `'description' in fields` (a runtime presence check) rather than `fields.description === undefined`, because the `Record<string, string>` index signature makes TypeScript treat every key as always present.
- The file is the "door" per `docs/theory/strategic-ddd.md` §5: sibling modules call these functions rather than building their own aggregation pipelines against the product collection.
