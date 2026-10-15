---
source: src/modules/invoicing/domain/index.ts
sha256: 0ae3799ee8b38cb6a38554f0653241ad3d8fa610f9f91587ffbf21b3dff99bc0
generated_at: 2026-10-15T10:38:02.186190+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/index.ts

## Purpose

Barrel file for the invoicing domain layer. It re-exports the pure business rules (specifically credit-share logic) so that higher tiers (services, tests) can import from a single, stable entry point without reaching into individual domain files. The module docblock asserts that this layer is lint-enforced to contain no Express, Mongoose, or other tier dependencies.

## Key elements

- **`creditShares`** (re-exported function from `./credit-shares`) — the sole value export; a pure domain rule for computing credit shares.
- **`CreditableInvoice`** (re-exported type) — domain shape describing an invoice that is eligible for credit.
- **`RefundedGoods`** (re-exported type) — domain shape describing refunded line items.
- **`CreditLine`** (re-exported type) — domain shape representing a single credit line item.

## Relationships

- **`domain/credit-shares.ts`** — sole source of everything this file re-exports; this index is its public face.
- **`invoicing/index.ts`** — module-level barrel that likely re-exports from this domain index, exposing `creditShares` and its types to external consumers.
- **`services/credit-breakdown.ts`** / **`services/issue-credit-note.ts`** — service-tier consumers that import `creditShares` (and/or the types) through this index to stay decoupled from the concrete domain file path.
- **`tests/unit/credit-shares.test.ts`** — unit test that exercises `creditShares` and validates the domain types.

## Notes

- This file is intentionally minimal: it contains no logic, only re-exports. All behavior lives in `credit-shares.ts`.
- The "lint-guaranteed free of Express, Mongoose" note in the docblock is a project convention (see `docs/theory/domain-layer.md`); if you add exports here, they must also satisfy that lint rule.
