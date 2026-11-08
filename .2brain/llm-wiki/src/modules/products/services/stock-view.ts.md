---
source: src/modules/products/services/stock-view.ts
sha256: 733b52fcb45e228ba545292af997c77b0619374e7f74f7e4bb07235d51843acf
generated_at: 2026-11-08T07:48:41.449465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/stock-view.ts

## Purpose

Enforces the stock-visibility boundary on product responses. Exact counters (`onHand`, `reserved`, `available`) are stripped for callers without the `read:StockLevel` ability, leaving only the pre-computed boolean flags (`inStock`, `lowStock`) that every response already carries. This prevents leaking sales velocity or enabling inventory-denial planning.

## Key elements

- **`canSeeStock(caller?: Caller): boolean`** — Returns `true` only when the caller is defined and holds the `read:StockLevel` ability (via `holds`). Call sites evaluate this once per request and pass the result downstream.
- **`redactStock<T extends Product>(product: T, seesStock: boolean): T`** — If `seesStock` is true, returns the product unchanged. Otherwise destructures out `onHand`, `reserved`, and `available`, returns the remaining fields, and re-attaches the row's version stamp via `carryVersion`. The `as T` cast is safe because the only fields removed are the three optional counters.

## Relationships

- **`src/kernel/ability.ts`** — Imports `holds` to perform the ability check in `canSeeStock`.
- **`src/infrastructure/persistence/versioning.ts`** — Imports `carryVersion` to re-associate the persistence version (used for `ETag`) with the newly-created redacted object.
- **`src/types/index.ts`** — Imports the `Caller` and `Product` type definitions.
- **`src/modules/products/services/index.ts`** — Re-exports this module so that sibling services and routes can import from the services barrel.
- **`src/modules/products/services/read.ts`**, **`src/modules/products/services/search.ts`** — Downstream consumers that build product responses and apply `redactStock` before returning wire data.
- **`src/modules/products/routes.ts`** — Route handlers pass `request.caller` into `canSeeStock` and the boolean into `redactStock`.
- **`src/modules/products/tests/unit/stock-view.test.ts`** — Unit tests covering both exports.

## Notes

- `seesStock` is intentionally computed **once per request**, not per product. Callers should not invoke `canSeeStock` inside a product loop.
- The `inStock` / `lowStock` flags must already be present on the product **before** `redactStock` runs; this function does not compute them.
- `carryVersion` is required because the rest-spread (`...visible`) creates a new plain object that has lost the version side-channel; without re-attaching it, `ETag` generation downstream would break.
- The three counters are typed as optional on `Product`; the `as T` cast after removal is safe and is the standard pattern in this codebase for field-stripping.
