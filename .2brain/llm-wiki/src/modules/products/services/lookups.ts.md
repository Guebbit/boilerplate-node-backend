---
source: src/modules/products/services/lookups.ts
sha256: c7885fc40e08e3107f360d0f10403392c5b4c5a4f3ab4f11b4b1708a98e4c92e
generated_at: 2026-10-15T11:44:49.189174+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/lookups.ts

## Purpose

Read-only lookup service that acts as the sole "door" onto the products collection for sibling modules (inventory, orders, cart, wishlist, delivery). It wraps raw, public, bulk, and count queries, mirrors inventory's stock counters onto the product document, and resolves multi-locale titles with a fallback — so callers never touch `productRepository` directly or hand-roll scope/translation logic.

## Key elements

- **`findByIdRaw`** — Returns the untransformed product document by id. Intended for `inventory` and `orders` which need live counters, not the scoped shape from `getById`.
- **`findPublicById`** — Returns the publicly visible product or `null`. The single read path for `cart` and `wishlist`.
- **`findManyByIds`** — Bulk raw lookup by an array of ids in one round-trip. Used by `orders` to join products onto its own rows.
- **`countPublic`** — Counts how many of a given id set are still publicly visible (active, not soft-deleted). Accepts `excludePreorders` to exclude products whose `releaseDate` is in the future. Reuses `productRepository.publicScope()` so the visibility rule lives in one place.
- **`syncStockCache`** — Writes `onHand`/`reserved` counters onto the product document. Sole legitimate caller is the `inventory` module; this function never decides whether a change is legal.
- **`translationsWithFallback`** — Returns `Record<locale, {title, description?}>` for a product. Fills the fallback-locale slot from the document's own `title`/`description` columns if no translation row exists.
- **`titlesOf`** — Derived from `translationsWithFallback`; returns only `Record<locale, title>`. Designed for contexts that must outlive the product (e.g. messages).
- **`titlesById`** — `titlesOf` resolved by id via `findById`; returns an empty object if the product doesn't exist or is hard-deleted.

## Relationships

- **`src/modules/products/repository.ts`** — Every function in this file delegates to `productRepository` (imported directly). This file is a thin service layer over that repository.
- **`src/modules/products/model.ts`** — Imports the `ProductDocument` type used as the parameter type for `translationsWithFallback` and `titlesOf`.
- **`src/kernel/translation.ts`** — Imports `readAllTranslations` to fetch translation rows keyed by entity id.
- **`src/infrastructure/i18n/index.ts`** (and **`catalog.ts`**) — Imports `getFallbackLocale` to determine which locale the document's own columns represent.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` to convert string ids to ObjectIds inside query filters.
- **`src/types/index.ts`** — Imports the `ProductTranslationFields` type used as the value type in translation maps.
- **`src/modules/products/services/index.ts`** — Barrel file that re-exports this module alongside `read.ts` and `remove.ts`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Downstream test that exercises product lookups in the delivery/fulfillment flow.

## Notes

- `findManyByIds` and `countPublic` wrap their body in `Promise.resolve().then(…)` deliberately: `toObjectId` throws synchronously on malformed ids, and deferring into the microtask converts that into a rejection so every caller sees a `Promise` rejection rather than a synchronous throw. This mirrors the convention documented in `orders/services/crud.ts#create`.
- The `description` field in `translationsWithFallback` uses `'description' in fields` (a presence check) rather than `fields.description === undefined`, because the `Record<string, string>` index signature makes the latter always `false` at the type level while the key may genuinely be absent at runtime.
- `syncStockCache` is intentionally a dumb write-through. Inventory is the source of truth for `onHand`/`reserved`; this function only keeps the product document's cached copy in step so a catalogue read needs no join.
- `countPublic` short-circuits to `Promise.resolve(0)` when `ids` is empty, avoiding an unnecessary repository call.
