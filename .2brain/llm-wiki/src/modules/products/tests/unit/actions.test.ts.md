---
source: src/modules/products/tests/unit/actions.test.ts
sha256: 0ac369b45e1508805bd0cd5e1b582f5e2f93214267c635b2a3bd31673697575f
generated_at: 2026-11-14T21:31:13.869224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/actions.test.ts

## Purpose
Unit tests for the `productActions` pure function. They verify the four action flags (`update`, `delete`, `restore`, `hardDelete`) returned for every combination of caller standing and soft-delete state, without requiring a database.

## Key elements
- **`LIVE`** – constant standing object (`{}`) representing a product with no `deletedAt`.
- **`DELETED`** – constant standing object with a fixed `deletedAt` ISO timestamp, simulating a soft-deleted product.
- **`describe('productActions')` / `it.each([...])`** – a single table-driven test block with 7 rows covering: no keys × live, no keys × deleted, update-only × live, delete-only × live, delete-only × deleted, all-keys × live, all-keys × deleted. Each row asserts the exact boolean array of the four flags.

## Relationships
- **`src/modules/products/domain/actions.ts`** – the sole SUT. This file imports `NO_PRODUCT_STANDING` (a standing with no `update`/`delete` keys) and `productActions(product, standing)` (the function under test). All assertions here pin down its contract.

## Notes
- The function is pure and synchronous; tests run in-memory with no mocks or DI.
- `LIVE` is an empty object (`{}`), so "live" means *absence* of `deletedAt`, not an explicit flag.
- The four flags are asserted as a flat boolean array (`[update, delete, restore, hardDelete]`), not by individual property names. If the domain adds a new action flag, the expected arrays here must be extended in the same positional order.
