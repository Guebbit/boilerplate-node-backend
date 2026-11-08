---
source: src/modules/orders/services/snapshot.ts
sha256: a68e851aba864283c46e289670e07b0f3ffbb4bc1178fcd8c0b6943b05d400e3
generated_at: 2026-11-08T07:01:08.794403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/snapshot.ts

## Purpose

Resolves catalogue products into the frozen order-line snapshots that an order persists. It lives in the `services/` tier (not `domain/`) on purpose: it reaches into `@infrastructure/i18n` and `@kernel/translation`, which the domain tier must not touch. Every order-writing path (admin create, checkout, admin line edit) funnels through `freezeOrderLines` so that locale stamping, tax-rate resolution, and preorder detection happen in one place.

## Key elements

- **`resolveSnapshotProducts(locale, products)`** — Takes plain (non-hydrated) product objects and overlays resolved `title`/`description` translations for the given locale. Uses `runWithLocale` to bind the locale explicitly rather than reading ambient request context, because the buyer's locale can differ from the request's. Returns the same array with translated fields merged in.
- **`freezeOrderLines(locale, products, quantities)`** — Calls `resolveSnapshotProducts`, then maps each product into an `OrderDocumentItem`. During the map it:
  - Strips `imageUrl`, `thumbnailUrl`, and `taxClass` (no schema slot; `taxRate` is resolved separately).
  - Keeps `rateType` (no resolved form; needed downstream by invoices).
  - Resolves `taxRate` via `resolveTaxRate(taxClass)`.
  - Conditionally adds a `preorder` field when `isPreorder(releaseDate, now)` is true.
  - Stamps `locale` and pairs `quantity` by index.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `catalog.ts`, `index.ts`) — Imports `runWithLocale` and `localeCandidatesFor` to bind locale and build fallback candidate list.
- **`src/kernel/translation.ts`** — Imports `resolveTranslations` to fetch translated fields for a set of product IDs.
- **`@modules/products`** (`index.ts`, `model.ts`, `domain/preorder.ts`, `tax.ts`) — Imports `ProductSnapshot` type, `isPreorder`, and `resolveTaxRate`.
- **`src/modules/orders/model.ts`** — Imports `OrderDocumentItem` as the return shape of `freezeOrderLines`.
- **`src/modules/orders/services/index.ts`** — Barrel re-exports both functions.
- **`src/modules/orders/services/place.ts`** — Consumer of `freezeOrderLines` during order creation.
- **`src/modules/orders/tests/unit/snapshot.test.ts`** — Unit tests for both exported functions.

## Notes

- **Plain objects only.** Callers must pass `.toObject()` output, never hydrated Mongoose documents or `.toJSON()` results. `.toJSON()` renames `_id` → `id`, which would cause Mongoose to mint a fresh `_id` when the object is written into the embedded `items.product` path, silently breaking `orderRepository.search`'s `productId` filter.
- **Locale is explicit, not ambient.** `runWithLocale` is used so out-of-band or async work cannot accidentally pick up a stale ambient locale from the request context.
- **Images are never frozen.** `imageUrl`/`thumbnailUrl` are destructured out before embedding; this is a deliberate schema decision, not an oversight.
- **`taxClass` is dropped, `rateType` is kept.** The resolved *rate* is what the order stores; `taxClass` is catalogue-side. `rateType` has no resolved counterpart and is needed later to distinguish zero-rated from exempt lines on invoices.
- **`products` and `quantities` are positionally paired.** They must be the same length and order; there is no key-based join.
