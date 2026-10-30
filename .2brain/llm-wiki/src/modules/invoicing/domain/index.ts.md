---
source: src/modules/invoicing/domain/index.ts
sha256: 268f422a4696ef491e50653e3be87bfc7e4e57b6f42e8cb675333782877ba5c4
generated_at: 2026-10-29T04:11:02.461372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/index.ts

## Purpose

Barrel file for the invoicing **domain layer**. It re-exports the public API (functions and types) from the three sibling rule modules so that consumers can import from a single path. The domain layer is intentionally framework-free — no Express, Mongoose, or any other tier — enforced by lint rules (see `docs/theory/domain-layer.md`).

## Key elements

- **Re-exports from `./credit-shares`** — `creditShares` (function), `CreditableInvoice`, `RefundedGoods`, `CreditLine` (types).
- **Re-exports from `./tax-items`** — `asTaxItems` (function).
- **Re-exports from `./retention`** — `buyerRetentionEnd`, `isBuyerRetentionOver`, `buyerRetentionScanBound` (functions).

The file contains **no logic of its own**; it is a pure re-export surface.

## Relationships

- **`./credit-shares.ts`, `./tax-items.ts`, `./retention.ts`** — the three source modules whose symbols are re-exported here.
- **`src/modules/invoicing/index.ts`** — the module-level entry point that aggregates this domain barrel (along with other sub-paths) for external consumers.
- **`src/modules/invoicing/services/*`** (credit-breakdown, issue-credit-note, retention) — service-layer files that import domain rules through this barrel rather than reaching into individual rule files.
- **`src/modules/invoicing/emails.ts`** — consumes domain types/functions for invoice-related email content.
- **`src/modules/invoicing/tests/unit/*`** — unit tests that import the re-exported symbols to verify the pure rules in isolation.

## Notes

- Treat this file as **read-only public API**. Add a new domain rule by creating a new file in `domain/` and adding its export here; do not put logic in this file.
- The "lint-guaranteed free of every tier" constraint means you **cannot** import Express, Mongoose, or other infra symbols anywhere in the files re-exported here without breaking the lint gate.
- Because it is a barrel, type-checkers and bundlers resolve every re-exported symbol through this path; a typo in an export name here will surface as a missing export in all downstream consumers.
