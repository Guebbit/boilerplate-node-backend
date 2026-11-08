---
source: src/modules/payments/domain/index.ts
sha256: d5f0d42cd0da296bf201a3517fe55b78543576734a116758475e4b28a2c2c4f2
generated_at: 2026-11-08T07:19:56.267655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/index.ts

## Purpose

Barrel file for the payments domain layer. It re-exports every public symbol from four sibling modules (`lifecycle`, `disputes`, `transfer-reference`, `display-status`) so consumers import from a single path. The domain layer is deliberately framework-free (no Express, Mongoose, or tier dependencies)—enforced by lint rules—and exists as a folder because the status vocabulary (6+ states) exceeds the project's threshold for a scattered-constant approach.

## Key elements

- **Re-exports from `./lifecycle`** — Status-set constants (`CONFIRMABLE_`, `IN_FLIGHT_`, `SETTLEABLE_`, `SUCCESS_SETTLEABLE_`, `REAPABLE_`, `REFUNDABLE_`, `OPEN_REFUND_`, `FINAL_REFUND_FAILURES`, `UNCLEAR_REFUND_FAILURES`, `MONEY_DID_NOT_MOVE_FAILURES`), helper predicates (`isHandRecorded`, `isOpenTransfer`, `isOpenRefund`, `mayBeCanceled`, `isFinalFailure`, `isReversed`, `owesBuyerAnotherWay`, `exceedsRemaining`, `exceedsBy`, `mayBeSettledByHand`), and computed-value functions (`refundDueBy`, `nextRefundAttemptAt`). Also the `MANUAL_PROVIDER` constant.
- **Re-exports from `./disputes`** — Open-dispute status set (`OPEN_DISPUTE_STATUSES`), filter/predicate functions (`openDisputeFilter`, `isOpenDispute`, `hasOpenDispute`, `hasOpenChargeback`, `lostToChargebacks`, `lostChargebackCovers`, `hasDecidedDispute`), and the types `DisputeFacts` / `DisputablePayment`.
- **Re-exports from `./transfer-reference`** — `buildReference` (constructs the RF creditor reference) and `parseReference` (admin-side parsing of that reference).
- **Re-exports from `./display-status`** — `displayStatusOf` (maps a payment to its user-facing label) and `displayStatusFilter` (query predicate for a given label), plus the `DisplayStatusInput` type.

## Relationships

- **`src/modules/payments/domain/lifecycle.ts`** — primary source; all lifecycle constants and predicates flow through this barrel.
- **`src/modules/payments/domain/disputes.ts`** — dispute rules and types re-exported here.
- **`src/modules/payments/domain/transfer-reference.ts`** — reference build/parse functions re-exported here.
- **`src/modules/payments/domain/display-status.ts`** — label logic re-exported here.
- **`src/modules/payments/index.ts`** — the module-level public entry point; likely re-exports (directly or transitively) from this barrel.
- **`src/modules/payments/services/*.ts`** (`intent`, `announce`, `notify`, `list`, `deadline`, `disputes`, `refund-settlement`) — consume the domain rules (status sets, predicates, reference helpers) without importing the sub-modules directly.
- **`src/modules/payments/repository.ts`** and **`presenter.ts`** — read domain constants/types (e.g. `displayStatusFilter`, dispute predicates) to build queries and present data.
- **`scenarios/support/doubles/payments/fake.ts`** — test double that mirrors the domain vocabulary (status constants, dispute shape) to build fake payment fixtures.

## Notes

- This file contains **no logic of its own**; it is purely a re-export barrel. Any bug or behavior change lives in one of the four source modules, not here.
- Types (`DisputeFacts`, `DisputablePayment`, `DisplayStatusInput`) are re-exported with `export type`, so consumers must use `import type` or named-type imports if isolated modules / `verbatimModuleSyntax` is enabled.
- The JSDoc points to `docs/theory/domain-layer.md` for the rationale behind the 6-state threshold and the folder-vs-constant convention.
- Adding a new domain rule to any sub-module requires updating this barrel (or switching a consumer to a deep import) for it to be visible to services, repository, presenter, and test doubles.
