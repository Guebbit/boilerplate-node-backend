---
source: src/modules/products/services/lookups.ts
sha256: 8622b8bf08edb5975c677f6ef0597a942440005b46d76c65e9450c6ee7ae4fee
generated_at: 2026-11-08T07:47:43.058146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/lookups.ts

## Purpose

Read-side service (the "door") that sibling modules use to look up products without touching the repository or translation infrastructure directly. Covers single/batch reads, public-count queries, stock-cache sync, and locale-aware title/translation retrieval.

## Key elements

- **`findByIdRaw` / `findByIdRawScoped`** — return the untransformed product document; the scoped variant applies a caller's read-scope so a hidden/removed product is indistinguishable from a missing one.
- **`isLive`** — `true` when the product exists and is not soft-deleted; used by late event handlers to confirm the product is still active.
- **`findPublicById`** — the single publicly visible product or `null` (used by cart, wishlist).
- **`findManyByIds`** — batch raw read by an array of ids in one query; wraps the call in `Promise.resolve().then(…)` so a bad id rejects rather than throws synchronously.
- **`countPublic`** — count of publicly visible products among a set of ids; optional `excludePreorders` filters out items whose `releaseDate` is in the future.
- **`syncStockCache`** — writes inventory counters (`onHand`/`reserved`) onto the product document inside a transaction; if the write flips the product into "buyable" it enqueues `PRODUCT_BUYABLE_AGAIN` via the outbox and nudges dispatch.
- **`translationsWithFallback`** — all translation rows (drafts included) with the product's own columns filling the fallback-locale slot.
- **`titlesOf`** — served-locale titles only (no drafts); pairs locale → title for message copy.
- **`titlesById`** — convenience wrapper: looks up by id then delegates to `titlesOf`; returns `{}` for a missing product.
- **`listPublicPage` / `countListed`** — paginated public-catalogue listing (id + last-change) and total count, used by the sitemap generator.
- **`withFallbackRow`** (module-private) — merges product columns under the translation rows, inserting the fallback-locale entry if no row exists for it.

## Relationships

- **`@infrastructure/persistence/create-repository`** — imports `toObjectId` for converting string ids to Mongo ObjectIds in query filters.
- **`@infrastructure/i18n`** — imports `getFallbackLocale` to determine which locale the product's own columns fill.
- **`@kernel/translation`** — imports `readAllTranslations` and `readServedTranslations` to fetch locale rows.
- **`@kernel/outbox`** — imports `enqueueOutboxEvent` / `nudgeOutbox` to emit `PRODUCT_BUYABLE_AGAIN` after a stock-cache sync flips buyability.
- **`@infrastructure/runtime/database`** — imports `withTransaction` so the stock-cache write and its outbox event commit atomically.
- **`../domain/buyable`** — imports `becameBuyable` to detect the non-buyable → buyable transition during sync.
- **`../events`** — imports the `PRODUCT_BUYABLE_AGAIN` event name.
- **`../repository`** — imports the `productRepository` singleton plus the `ListedProduct` and `StockCounters` types.
- **`../model`** — imports the `ProductDocument` type.
- **`@types`** — imports the `ProductTranslationFields` type.

## Notes

- **Deferred-promise idiom:** `findManyByIds` and `countPublic` wrap their body in `Promise.resolve().then(…)` specifically so that a synchronous throw from `toObjectId` (malformed id) surfaces as a rejected promise, matching the convention in `orders/services/crud.ts#create`. Every caller can uniformly `.catch`.
- **Product columns *are* the fallback translation:** `title` and `description` on the document are not redundant with the translation rows — they are the fallback-locale content. `withFallbackRow` relies on this and will insert them if the translation port has no row for that locale.
- **`description` presence check:** uses `'description' in fields` rather than a `=== undefined` comparison, because the `Record<string, string>` index signature makes a missing key indistinguishable from `""` via equality alone.
- **`syncStockCache` is the only write in this otherwise read-only module.** Its sole intended caller is the inventory module; the function does not validate whether the change is legal — it mirrors whatever inventory committed.
- **`titlesOf` excludes draft locales** by design: it feeds persistent message copies (inbox, export, email), so a customer must never see an unpublished title.
