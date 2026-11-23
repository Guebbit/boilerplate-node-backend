---
source: src/modules/products/domain/actions.ts
source_sha256: a044afd838c79609073b24f548d20da9395567fef6af5e38d2b128ef4ef7d069
context_sha256: 906cfb3304add5cc07ccfd46dbfdbf436680869a474705b5cd6ccd168afc4289
generated_at: 2026-11-22T07:08:33.939109+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/actions.ts

## Purpose
Pure rule that turns a caller's permissions and a product's soft-delete state into a set of per-action boolean flags (`ProductActions`). It holds no I/O, so the logic is easy to test and reuse wherever a product's allowed actions need to be computed.

## Key elements
- `ProductStanding` — interface describing the caller's pre-combined keys:
  - `update` is true when the caller holds both `update:Product` and `update:Translation`.
  - `delete` is true when the caller holds `delete:Product`. Soft delete, restore and hard delete all share this key.
- `NO_PRODUCT_STANDING` — a standing with every flag `false`, for a caller who holds nothing.
- `NO_PRODUCT_ACTIONS` — a `ProductActions` with every flag `false`, for a product read for nobody in particular.
- `productActions(product, standing)` — returns `ProductActions`. It reads only `product.deletedAt` (truthiness), and sets:
  - `update` = `standing.update`
  - `delete` = `standing.delete` and the product is not deleted
  - `restore` = `standing.delete` and the product is deleted
  - `hardDelete` = `standing.delete`

## Relationships
- Imports the `ProductActions` type from `@types` (`src/types/index.ts`).
- The neighbors listed below are in the graph around this file. The file itself shows no imports from them, so any consumption is by them, not by this file:
  - `src/modules/products/model.ts`
  - `src/modules/products/presenter.ts`
  - `src/modules/products/services/actions.ts`
  - `src/modules/products/services/read.ts`
  - `src/modules/products/tests/unit/actions.test.ts`
  - `src/modules/products/domain/index.ts`

## Notes
- The caller combines the keys before calling. This file does not check `update:Product` and `update:Translation` separately.
- `deletedAt` is typed `unknown` and only checked for truthiness, so any truthy value counts as deleted.
- `delete` and `restore` are mutually exclusive, because one requires a non-deleted product and the other a deleted one. `hardDelete` is independent of deletion state.
