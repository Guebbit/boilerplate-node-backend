---
source: src/modules/payments/domain/index.ts
sha256: d5f0d42cd0da296bf201a3517fe55b78543576734a116758475e4b28a2c2c4f2
generated_at: 2026-10-29T05:04:59.888187+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/index.ts

## Purpose

Barrel file that re-exports every public symbol of the payments **domain layer** — pure status vocabulary, dispute predicates, bank-transfer reference helpers, and display-label logic — so callers can import from a single path (`payments/domain`) without reaching into individual sub-modules. The header doc block states the contract: no Express, Mongoose, or framework-tier imports are permitted here (enforced by lint).

## Key elements

- **`./lifecycle` re-exports** — The core status sets (`CONFIRMABLE`, `IN_FLIGHT`, `SETTLEABLE`, `SUCCESS_SETTLEABLE`, `REAPABLE`, `REFUNDABLE`), provider constant (`MANUAL_PROVIDER`), and predicate/helper functions for refunds (`mayBeCanceled`, `refundDueBy`, `exceedsRemaining`, `exceedsBy`, `nextRefundAttemptAt`), money-movement guards (`owesBuyerAnotherWay`, `MONEY_DID_NOT_MOVE_FAILURES`), and refund-failure classification (`isFinalFailure`, `isReversed`, `FINAL_REFUND_FAILURES`, `UNCLEAR_REFUND_FAILURES`).
- **`./disputes` re-exports** — Open/lost chargeback predicates (`isOpenDispute`, `hasOpenDispute`, `hasOpenChargeback`, `lostToChargebacks`, `lostChargebackCovers`, `hasDecidedDispute`), the `openDisputeFilter` query builder, and the `DisputeFacts` / `DisputablePayment` types.
- **`./transfer-reference` re-exports** — `buildReference` / `parseReference` for the RF creditor reference on bank-transfer payments.
- **`./display-status` re-exports** — `displayStatusOf` (label computation) and `displayStatusFilter` (query behind a label), plus the `DisplayStatusInput` type.

## Relationships

- **Re-exports from** `lifecycle.ts`, `disputes.ts`, `transfer-reference.ts`, and `display-status.ts` — the four files that actually implement the domain rules.
- **Consumed by** `src/modules/payments/index.ts` (module-level barrel), `presenter.ts`, `repository.ts`, and every service under `services/` (`announce`, `deadline`, `disputes`, `intent`, `list`, `notify`, `refund-settlement`), which import domain vocabulary and predicates through this file rather than from the sub-modules directly.
- **Test double** `scenarios/support/doubles/payments/fake.ts` mirrors the same export surface so tests can swap the real domain for a stub.

## Notes

- The file contains **no logic of its own** — it is purely a re-export barrel. Changes to the public API surface live in the four sub-modules; this file only adds or removes `export … from` lines.
- The doc comment references `docs/theory/domain-layer.md` for the rationale behind the folder layout (status vocabulary width > threshold ⇒ dedicated `domain/` folder).
- Because the domain layer is lint-guaranteed free of framework imports, any new export added here must also satisfy that constraint at the source sub-module.
