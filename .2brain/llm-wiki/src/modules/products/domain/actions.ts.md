---
source: src/modules/products/domain/actions.ts
sha256: a044afd838c79609073b24f548d20da9395567fef6af5e38d2b128ef4ef7d069
generated_at: 2026-11-14T21:23:21.905475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/actions.ts

## Purpose

Pure domain rule that translates a caller's key standing plus a product's deletion state into the four concrete action flags (`update`, `delete`, `restore`, `hardDelete`) a UI or service layer may offer. It exists to centralise the "what can I do with this product?" decision so that no other module re-derives it.

## Key elements

- **`ProductStanding`** (interface) — the caller's relevant keys collapsed to two booleans: `update` (holds `update:Product` + `update:Translation`) and `delete` (holds `delete:Product`).
- **`NO_PRODUCT_STANDING`** (const) — all-false `ProductStanding`; used when the caller has no product keys.
- **`NO_PRODUCT_ACTIONS`** (const) — all-false `ProductActions`; the zero-value returned when nothing is permitted.
- **`productActions`** (function) — the single exported rule. Takes `{ deletedAt?: unknown }` and a `ProductStanding`, returns a `ProductActions`. Logic:
  - `update` → passes `standing.update` through unchanged.
  - `delete` → `standing.delete && !deleted` (only when the product is *not* soft-deleted).
  - `restore` → `standing.delete && deleted` (only when it *is* soft-deleted).
  - `hardDelete` → `standing.delete` (always available to the delete-key holder, regardless of state).

## Relationships

- **`src/types/index.ts`** — imports the `ProductActions` type used as the return shape of `productActions` and the shape of `NO_PRODUCT_ACTIONS`.
- **`src/modules/products/domain/index.ts`** — barrel file; re-exports this module so consumers import from the domain package path.
- **`src/modules/products/presenter.ts`** — calls `productActions` (or the constants) to populate the per-product action fields in the view model.
- **`src/modules/products/services/actions.ts`** — the service layer reads the returned flags to gate mutation endpoints (update, delete, restore, hard-delete).
- **`src/modules/products/services/read.ts`** — may supply `NO_PRODUCT_ACTIONS` when the caller has no standing, or call `productActions` to annotate each product in a list response.
- **`src/modules/products/tests/unit/actions.test.ts`** — unit-tests `productActions` across standing × deletion-state combinations.
- **`src/modules/products/tests/unit/stock-view.test.ts`** — exercises the presenter path that depends on these flags appearing correctly in the rendered view.

## Notes

- The function is intentionally stateless and impure-free; it reads only `deletedAt` from the product argument. Do not pass a full product entity if a narrower shape suffices.
- `hardDelete` is deliberately *not* gated on `deleted`: a caller with the delete key can hard-delete both live and soft-deleted products. The `delete` and `restore` flags are mutually exclusive.
- `update` has no `deletedAt` guard—whether soft-deleted products are editable is a policy decision made outside this rule (e.g. in the service layer).
- The `deletedAt` parameter is typed `unknown` (not `string`/`Date`) so callers can pass whatever their storage layer uses; the rule only checks truthiness.
