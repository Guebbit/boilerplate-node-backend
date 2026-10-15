---
source: src/modules/orders/services/snapshot.ts
sha256: a68e851aba864283c46e289670e07b0f3ffbb4bc1178fcd8c0b6943b05d400e3
generated_at: 2026-10-15T11:11:14.626444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/snapshot.ts

## Purpose

Resolves catalogue products into the frozen order-line snapshot that an order stores. It translates product `title`/`description` into the buyer's locale, strips non-freezable fields, computes the tax rate, and assembles the final `OrderDocumentItem[]` shape. It lives in `services/` rather than `domain/` because it deliberately reaches into `@infrastructure/i18n` and `@kernel/translation`.

## Key elements

- **`resolveSnapshotProducts<T extends { _id: Types.ObjectId }>(locale, products): Promise<T[]>`** — Translates each product's `title`/`description` via `resolveTranslations`, then overlays the translated fields onto the original plain object. Returns the input array with translated fields merged in; products with no matching translation row are passed through unchanged.
- **`freezeOrderLines(locale, products, quantities): Promise<OrderDocumentItem[]>`** — Calls `resolveSnapshotProducts`, then for each product strips `imageUrl`, `thumbnailUrl`, and `taxClass`; resolves `taxRate` from `taxClass`; appends a `preorder` flag when `releaseDate` is in the future; and pairs the result with the corresponding quantity and locale. This is the single place all order-line writers (admin create, checkout, line edit) call to produce lines.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `catalog.ts` via `index.ts`) — Provides `runWithLocale` (explicit locale binding) and `localeCandidatesFor` (locale fallback list). This file calls both to perform translation in the buyer's locale without relying on ambient request context.
- **`@kernel/translation`** — Provides `resolveTranslations`, the actual lookup that returns per-product-ID translated field maps.
- **`@modules/products`** (`index.ts` → `model.ts`, `tax.ts`, `domain/preorder.ts`) — Supplies the `ProductSnapshot` type, `isPreorder`, and `resolveTaxRate` used during line assembly.
- **`../model.ts`** — Supplies the `OrderDocumentItem` return type.
- **`../services/index.ts`** — Barrel export; re-exports both functions so callers (e.g. `place.ts`) import from the services namespace.
- **`../services/place.ts`** — Consumes `freezeOrderLines` when building the order document for checkout.
- **`../tests/unit/snapshot.test.ts`** — Unit tests covering both exports.

## Notes

- **Plain objects only.** Both functions expect plain (Lean) objects, not hydrated Mongoose documents. A caller holding a populated document must call `.toObject()` before passing it in. Using `.toJSON()` would rename `_id` → `id`, causing Mongoose to mint a fresh `_id` on embed and silently breaking `orderRepository.search`'s `items.product._id` filter.
- **Locale is bound, not ambient.** `runWithLocale` is used explicitly because the buyer's locale (stored or requested) can differ from the current request's negotiated locale. See `docs/tools/i18n.md`.
- **What is stripped vs. kept on freeze.** `imageUrl`, `thumbnailUrl`, and `taxClass` are removed (the schema has no slot; `taxClass` is replaced by the resolved `taxRate`). `rateType` is intentionally *not* stripped—it has no resolved form and is needed downstream to distinguish zero-rated from exempt lines.
- **Preorder detection** is purely date-based (`isPreorder` against `new Date()`); the caller is expected to have already excluded hidden/off-sale products.
