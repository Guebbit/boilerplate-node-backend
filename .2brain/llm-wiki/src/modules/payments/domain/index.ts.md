---
source: src/modules/payments/domain/index.ts
sha256: 0f4f5fcf53d1e930bc7ab15889ee6d2a43d96dfb952aa016aff03e53c4a48368
generated_at: 2026-11-14T20:59:46.829392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/index.ts

## Purpose

Barrel file for the payments domain layer. It re-exports the pure business rules (status vocabularies, lifecycle transitions, dispute semantics, transfer-reference helpers, and display-status logic) from the four sibling modules so that application-layer consumers import from a single path. It exists because the 6-wide status vocabulary crosses the threshold that makes a dedicated `domain/` folder mandatory, consolidating what would otherwise be scattered constants beside each read site.

## Key elements

- **Re-exports from `./lifecycle`** — the core status constants (`CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`; `REFUNDABLE_PAYMENT_STATUS`; `OPEN_REFUND_STATUSES`), the `MANUAL_PROVIDER` sentinel, predicate helpers (`isHandRecorded`, `isOpenTransfer`, `isOpenRefund`, `mayBeCanceled`, `isFinalFailure`, `isReversed`, `owesBuyerAnotherWay`, `mayBeSettledByHand`), refund-due calculation (`refundDueBy`, `nextRefundAttemptAt`), overflow checks (`exceedsRemaining`, `exceedsBy`), and refund-failure taxonomies (`FINAL_REFUND_FAILURES`, `UNCLEAR_REFUND_FAILURES`, `MONEY_DID_NOT_MOVE_FAILURES`). Also the `RefundDue` type.
- **Re-exports from `./disputes`** — `OPEN_DISPUTE_STATUSES`, filter factory `openDisputeFilter`, predicates (`isOpenDispute`, `hasOpenDispute`, `hasOpenChargeback`, `hasDecidedDispute`), and chargeback-loss helpers (`lostToChargebacks`, `lostChargebackCovers`). Also the `DisputeFacts` and `DisputablePayment` types.
- **Re-exports from `./transfer-reference`** — `buildReference` (constructs an RF creditor reference) and `parseReference` (admin-side reverse parse).
- **Re-exports from `./display-status`** — `displayStatusOf` (derives the label shown to the user) and `displayStatusFilter` (builds a query for a given label). Also the `DisplayStatusInput` type.

## Relationships

- **Source modules** — all four sibling files (`lifecycle.ts`, `disputes.ts`, `transfer-reference.ts`, `display-status.ts`) are the sole import targets; this file adds no logic of its own.
- **Application-layer consumers** — `src/modules/payments/index.ts` (module barrel), `presenter.ts`, `repository.ts`, and every file under `services/` (`announce.ts`, `deadline.ts`, `disputes.ts`, `intent.ts`, `list.ts`, `notify.ts`, `refund-settlement.ts`) import rules through this barrel rather than reaching into the sub-files directly.
- **Test doubles** — `scenarios/support/doubles/payments/fake.ts` imports from this barrel to satisfy the same interfaces as real services.

## Notes

- **No own logic.** Every line is an `export … from` or `export type … from` statement. Changing behavior means editing the four sibling modules, not this file.
- **Lint-enforced purity.** The header docstring states the domain layer is "lint-guaranteed free of Express, Mongoose and every tier." Adding a framework import to any of the four source files (or accidentally to this one) violates that invariant.
- **Single import path convention.** Downstream code should import from `domain/index.ts` (or the module root) rather than from `domain/lifecycle` etc., keeping the domain's public surface in one place and making it trivial to add/remove submodules later.
- **Design rationale** is documented externally in `docs/theory/domain-layer.md`.
