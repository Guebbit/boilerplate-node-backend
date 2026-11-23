---
source: src/modules/invoicing/domain/index.ts
source_sha256: 17647ceda70405d27cf44306869195be67801bf7391fe38980bb6172e45d5e29
context_sha256: 9deed5386f4ed39f734ca07650dd081418859558008f8d2000110b248acb08c0
generated_at: 2026-11-22T05:30:35.583404+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/domain/index.ts

## Purpose
Barrel file for the invoicing module's domain layer. It re-exports the layer's pure business rules from one entry point. Its module doc says the layer holds pure rules only and is lint-guaranteed free of Express, Mongoose and every tier.

## Key elements
- `creditShares`: re-exported from `./credit-shares`.
- Types `CreditableInvoice`, `RefundedGoods`, `CreditLine`: re-exported from `./credit-shares`.
- `remainderLines`: re-exported from `./remainder`.
- `asTaxItems`: re-exported from `./tax-items`.
- `buyerRetentionEnd`, `isBuyerRetentionOver`, `buyerRetentionScanBound`: re-exported from `./retention`.

The file defines no logic of its own.

## Relationships
- **Sources:** it re-exports from the sibling files `credit-shares.ts`, `remainder.ts`, `tax-items.ts` and `retention.ts`.
- **Consumers:** the graph links it to `src/modules/invoicing/index.ts`, `emails.ts` and the services `credit-breakdown.ts`, `figures.ts`, `issue-credit-note.ts` and `retention.ts`. These presumably import domain rules through this barrel.
- **Tests:** the unit tests `credit-breakdown.test.ts`, `credit-shares.test.ts`, `remainder.test.ts` and `retention.test.ts` are also linked neighbors.

## Notes
- Add new domain rules by exporting them here, and keep them free of Express, Mongoose and tier dependencies, because lint enforces that.
- The type exports use `export type`, so they are erased at runtime.
