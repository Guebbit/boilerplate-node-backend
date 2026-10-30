---
source: src/modules/products/services/stock-view.ts
sha256: 733b52fcb45e228ba545292af997c77b0619374e7f74f7e4bb07235d51843acf
generated_at: 2026-10-29T05:30:13.150807+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/stock-view.ts

## Purpose

Enforces the visibility boundary for product stock data. Exact counters (`onHand`, `reserved`, `available`) are exposed only to callers holding the `read:StockLevel` ability; all other callers receive just the boolean flags `inStock` and `lowStock`. This prevents leaking sales-velocity data to competitors and reduces the attack surface for inventory-denial planning.

## Key elements

- **`canSeeStock(caller?: Caller): boolean`** — Returns `true` only when the caller is defined **and** holds the `read:StockLevel` ability (checked via `holds`). Safe to call with `undefined` for anonymous requests.
- **`redactStock<T extends Product>(product: T, seesStock: boolean): T`** — If `seesStock` is `true`, returns the product unchanged. Otherwise strips `onHand`, `reserved`, and `available` via a rest-spread, then re-attaches the persistence version (used for `ETag`) via `carryVersion`. Generic in `T` so callers keep their full product type.

## Relationships

- **`src/kernel/ability.ts`** — `canSeeStock` calls `holds(caller, 'read', 'StockLevel')` to evaluate the ability.
- **`src/infrastructure/persistence/versioning.ts`** — `redactStock` calls `carryVersion` to re-attach the row version to the redacted copy (the rest-spread drops it).
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Provides the `Caller` and `Product` types imported at the top.
- **`src/modules/products/services/index.ts`** — Barrel re-exports this module for other product services.
- **`src/modules/products/services/read.ts`, `src/modules/products/services/search.ts`, `src/modules/products/routes.ts`** — Downstream consumers that call `canSeeStock` once per request and pass the result into `redactStock` for each product in the response.
- **`src/modules/products/tests/unit/stock-view.test.ts`** — Unit tests for both exports.

## Notes

- Call `canSeeStock` **once per request**, not once per product; pass the boolean into `redactStock`. The file's JSDoc makes this explicit.
- The `as T` cast in `redactStock` is intentional: the rest-spread narrows the type by removing the three optional counter fields, but the result is still a valid `T` for every other declared field.
- `carryVersion` is needed because the rest-spread creates a plain object that loses the version sidecar; without it the `ETag` header would break.
- The module is side-effect-free and pure (no I/O, no state), so it is trivially testable in isolation.
