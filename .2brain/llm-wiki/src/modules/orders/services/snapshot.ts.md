---
source: src/modules/orders/services/snapshot.ts
sha256: e2331d2433a858b4cca50502a3b2710f779bc59a454aa3d811ed9e338bbc5c6a
generated_at: 2026-09-23T19:09:05.644687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/snapshot.ts

## Purpose

Resolves catalogue product rows into the locale-specific snapshot that an order line freezes at write time, and assembles the final `OrderDocumentItem[]` array. It exists in `services/` (not the domain tier) because it deliberately reaches into `@infrastructure/i18n` and `@kernel/translation` to perform locale-aware field resolution.

## Key elements

- **`resolveSnapshotProducts(locale, products)`** — Binds `locale` via `runWithLocale`, fetches translation rows for each product's `_id` through `resolveTranslations`, and overlays the resolved `title`/`description` onto the caller's plain objects. Products without a translation row are returned unchanged.
- **`freezeOrderLines(locale, products, quantities)`** — The single entry point every order writer (admin create, checkout, admin line edit) calls. Delegates to `resolveSnapshotProducts`, then maps each product into an `OrderDocumentItem` (`product`, `quantity`, `locale`). Explicitly strips `imageUrl`, `thumbnailUrl`, and `taxClass` from the embedded product; resolves `taxClass` → `taxRate` via `resolveTaxRate` so only the numeric rate is persisted.

## Relationships

- **`@infrastructure/i18n`** (`context.ts`, `catalog.ts`, `index.ts`) — Imports `runWithLocale` (locale binding) and `localeCandidatesFor` (locale fallback chain) for the translation lookup.
- **`@kernel/translation.ts`** — Imports `resolveTranslations` to fetch the actual translated field rows keyed by entity type and `_id`.
- **`@modules/products`** (`model.ts`, `tax.ts`, `index.ts`) — Imports the `ProductSnapshot` type and `resolveTaxRate` to convert a product's tax class into the rate stored on the order line.
- **`../model.ts`** — Imports the `OrderDocumentItem` type that `freezeOrderLines` returns.
- **`../services/place.ts`, `../services/crud.ts`** — Callers that invoke `freezeOrderLines` when creating or editing orders.
- **`../services/index.ts`** — Barrel re-export so other modules can import this service.
- **`../tests/unit/snapshot.test.ts`** — Unit tests for both exported functions.

## Notes

- **Plain objects only, never hydrated Mongoose docs.** The `{ ...product, ...fields }` spread requires real own properties. A caller holding a hydrated document must call `.toObject()` first — `.toJSON()` renames `_id` → `id`, which causes Mongoose to mint a fresh `_id` on the embedded sub-document and silently breaks `orderRepository.search`'s `productId` filter.
- **Locale is always bound explicitly.** `runWithLocale` is used rather than reading ambient context because the buyer's stored/requested locale can differ from the current HTTP request's negotiated locale (e.g. out-of-band jobs).
- **`imageUrl` / `thumbnailUrl` are dropped at freeze time, not by Mongoose strict mode.** The destructure in `freezeOrderLines` is the single documented place where this exclusion lives; the order-line schema has no fields for them.
- **`taxClass` never persists.** Only the resolved `taxRate` number is stored, mirroring how `onHand`/`reserved` are excluded from the frozen product.
