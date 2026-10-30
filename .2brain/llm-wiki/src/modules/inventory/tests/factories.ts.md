---
source: src/modules/inventory/tests/factories.ts
sha256: c4cc6ca041fa9d6384c8a12b0e303d0b1d619ebd4c9ccf61a8c2417e889d2b10
generated_at: 2026-10-29T04:05:57.065533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/factories.ts

## Purpose

A test-only re-export and helper surface that lets **sibling** modules (cart, delivery, orders, payments, returns) read and manipulate inventory stock rows directly, without crossing the import boundary that forbids them from importing `../repository` or `../model` themselves.

## Key elements

- **`removeLevel`** — re-export from `../services/levels`. Erases a product's stock-level row. In production only inventory's own `product.deleted` listener calls this; here it exists so a sibling can test the "product has no level row" path.
- **`stockLevelRepository` / `reservationRepository`** — re-exports from `../repository`. Give a sibling's test direct read access to the ledger rows and holds for its own assertions.
- **`forceStockLevel(productId, onHand, reserved)`** — writes `onHand`, `reserved`, and a derived `available` straight into `stockLevelModel` via `updateOne`, bypassing every conditional-movement rule and leaving the catalogue's cached copy untouched. The only way a test can make the ledger disagree with the cache. Explicitly not a production entry point.

## Relationships

- **`src/modules/inventory/model.ts`** — imported for `stockLevelModel`, used only by `forceStockLevel`.
- **`src/modules/inventory/repository.ts`** — re-exported wholesale so sibling tests avoid importing it directly.
- **`src/modules/inventory/services/levels.ts`** — `removeLevel` re-exported from here.
- **Sibling integration tests** (`cart/…`, `delivery/lost-parcel`, `orders/hold-doors`, `payments/reconcile`, `returns/…`) — the primary consumers; they import this file instead of reaching into inventory internals.
- **`src/modules/inventory/tests/integration/top-up.test.ts`** — inventory's own test suite; does **not** need this factory (it may import internals directly).

## Notes

- `forceStockLevel` does **not** update the catalogue cache; if a sibling test subsequently reads through the cache it will see the old value. Use the repository exports when you need cache-consistent assertions.
- The file is intentionally minimal: it adds one new function (`forceStockLevel`) and re-exports two existing repositories and one service method. No state is created here—every write goes through the target module's own model/repository.
- Per the module doc comment, sibling import boundaries are enforced (see `docs/reference/tests.md`); adding a new inventory export here is the sanctioned escape hatch rather than loosening the boundary.
