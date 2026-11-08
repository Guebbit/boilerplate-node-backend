---
source: src/modules/invoicing/domain/index.ts
sha256: 268f422a4696ef491e50653e3be87bfc7e4e57b6f42e8cb675333782877ba5c4
generated_at: 2026-11-08T06:10:27.372966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/index.ts

## Purpose

Barrel (re-export) file for the invoicing **domain layer**. It gives external consumers a single import path for the pure business rules defined in sibling files, while the JSDoc contract guarantees the module contains no framework or persistence imports (no Express, Mongoose, or "tier" code).

## Key elements

- **`creditShares`** (from `./credit-shares`) — computes credit allocation across invoices.
- **`CreditableInvoice`, `RefundedGoods`, `CreditLine`** (types, from `./credit-shares`) — structural types describing the inputs/outputs of credit sharing.
- **`asTaxItems`** (from `./tax-items`) — converts a raw representation into tax-item structures.
- **`buyerRetentionEnd`** (from `./retention`) — returns the retention end-date for a buyer.
- **`isBuyerRetentionOver`** (from `./retention`) — boolean check whether the buyer's retention period has elapsed.
- **`buyerRetentionScanBound`** (from `./retention`) — returns the boundary value used when scanning for retention-eligible records.

## Relationships

- **Re-exports from:** `credit-shares.ts`, `tax-items.ts`, `retention.ts` — the three domain rule files this barrel surfaces.
- **Imported by:** `../index.ts` (module root), `emails.ts`, `services/credit-breakdown.ts`, `services/issue-credit-note.ts`, `services/retention.ts`, and the unit tests (`tests/unit/credit-breakdown.test.ts`, `tests/unit/credit-shares.test.ts`, `tests/unit/retention.test.ts`). These consumers import the domain rules through this single entry point rather than reaching into the individual rule files.

## Notes

- This file defines **no logic of its own**; it is purely a re-export surface. All behavior lives in the three sibling files.
- The purity guarantee ("lint-guaranteed free of Express, Mongoose and every tier") is enforced by lint rules, not by convention. Do not add framework imports here or in the re-exported modules without updating the lint configuration.
- When adding a new domain rule file, export it from here to keep the public surface consistent for the consumers listed above.
