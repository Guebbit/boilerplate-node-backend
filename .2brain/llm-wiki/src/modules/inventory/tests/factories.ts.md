---
source: src/modules/inventory/tests/factories.ts
sha256: c4cc6ca041fa9d6384c8a12b0e303d0b1d619ebd4c9ccf61a8c2417e889d2b10
generated_at: 2026-11-08T06:04:46.246003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/factories.ts

## Purpose

A test-only re-export layer that gives sibling modules' integration tests controlled access to inventory's internal storage primitives (stock rows, reservation rows, level service). It exists because the import boundary blocks those tests from reaching `../repository` or `../model` directly; this file is the sanctioned door.

## Key elements

- **`forceStockLevel(productId, onHand, reserved)`** — Local export. Overwrites a level row's counters via `stockLevelModel.updateOne`, computing `available` as `onHand − reserved`. Bypasses all stock-movement rules and leaves the catalogue's cached copy untouched. Test-only: no production code calls this.
- **`removeLevel`** — Re-exported from `../services/levels`. Deletes a product's level row. In production only inventory's own `product.deleted` listener triggers this.
- **`stockLevelRepository`** — Re-exported from `../repository`. Gives a sibling test direct read access to stock-level documents for assertions.
- **`reservationRepository`** — Re-exported from `../repository`. Gives a sibling test direct read access to reservation/hold documents.

## Relationships

- **Imports** `stockLevelModel` from `src/modules/inventory/model.ts` (used internally by `forceStockLevel`).
- **Re-exports** `stockLevelRepository` and `reservationRepository` from `src/modules/inventory/repository.ts`, and `removeLevel` from `src/modules/inventory/services/levels.ts`.
- **Consumed by** sibling integration tests across cart (`stock`, `checkout-stock-divergence`, `product-removal-protects-orders`, `checkout-interleavings`), delivery (`lost-parcel`), orders (`hold-doors`), payments (`reconcile`), returns (`lost-parcel`, `restock`), and shop-tasks (`work-summary`). These tests call `forceStockLevel` to set up divergent ledger state and use the repositories to assert on resulting rows.
- **Consumed by** inventory's own `tests/integration/top-up.test.ts`.

## Notes

- This file is a **test-side** module; the header JSDoc explicitly states it is not a production API. The `forceStockLevel` doc comment reinforces: "Never a production door."
- `forceStockLevel` writes `available` as a derived value (`onHand − reserved`) rather than setting it independently — a test author must keep that invariant in mind when choosing arguments.
- The import of `Types` from `mongoose` is type-only (`import type`); no runtime Mongoose dependency is added beyond what `model.ts` already pulls in.
- Because `removeLevel` is re-exported (not re-implemented), any future change to its signature in `services/levels.ts` flows through automatically.
