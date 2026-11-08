---
source: src/modules/payments/domain/disputes.ts
sha256: 1bea2e68184456fd46d733f14e3dcbe03f581f4eb9445e160666dda57c4bb656
generated_at: 2026-11-08T07:19:44.417519+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/disputes.ts

## Purpose

Pure domain rules that determine what a shop may still do with a payment while a buyer-initiated dispute (inquiry or chargeback) stands. The file performs no I/O and produces no side effects; it only classifies dispute state and computes the monetary ceiling the bank has already taken. A key semantic distinction it enforces: a chargeback is **not** a refund — it lowers `charged`, never `refunded`, and never issues a credit note.

## Key elements

- **`DisputeFacts`** — read-only slice of a stored dispute the rules consume (`kind`, `status`, `amount`, `currency`).
- **`DisputablePayment`** — minimal payment shape the rules accept (optional `disputes` array).
- **`OPEN_DISPUTE_STATUSES`** — exported array (`needs_response`, `under_review`); the set of statuses where the shop or bank still has a move.
- **`LOSS_DISPUTE_STATUSES`** (private) — set of terminal statuses where the bank kept the money (`lost`, `accepted`).
- **`openDisputeFilter()`** — returns a Mongo `$elemMatch` filter; feeds the staff list's `disputed` query.
- **`isOpenDispute(dispute)`** — true if a single dispute is in an open status.
- **`hasOpenDispute(payment)`** — true if any dispute (any kind) on the payment is still open.
- **`hasOpenChargeback(payment)`** — true only if an *open chargeback* exists; this is the gate that blocks further refunds. An open inquiry does **not** block refunds.
- **`lostToChargebacks(payment, currency)`** — sums minor units taken by lost/accepted chargebacks via `addMoney`. A `won` chargeback contributes zero (funds reinstated).
- **`lostChargebackCovers(payment, amount, currency)`** — whether the lost-chargeback total covers a given refund amount; used to report an open refund as "returned by the bank."
- **`hasDecidedDispute(payment)`** — true when disputes exist **and** no open chargeback remains; signals that a refund previously refused as `disputed` is no longer pending.

## Relationships

- **`src/types/index.ts`** — source of the `DisputeKind` and `DisputeStatus` enums used throughout.
- **`src/domain-primitives/money.ts`** — provides `addMoney`, `toMinorUnits`, and the `Money` type for all arithmetic in this file.
- **`src/modules/payments/domain/index.ts`** — barrel that re-exports this module alongside `lifecycle.ts`.
- **`src/modules/payments/domain/lifecycle.ts`** — sibling pure-rules file; dispute rules and lifecycle rules are consumed together by services.
- **`src/modules/payments/repository.ts`** — consumes `openDisputeFilter()` to build the Mongo query behind the `disputed` list filter.
- **`src/modules/payments/services/list.ts`** — calls `openDisputeFilter()` to apply the `disputed` filter in staff-facing payment listings.
- **`src/modules/payments/services/refunds.ts`** / **`refund-settlement.ts`** — call `hasOpenChargeback`, `lostToChargebacks`, and `lostChargebackCovers` to gate or annotate refund eligibility and reporting.
- **`src/modules/payments/services/disputes.ts`** — applies these rules when processing dispute state transitions.
- **`src/modules/payments/services/view.ts`** — reads dispute state for display purposes.
- **`src/modules/payments/tests/unit/refund-rules.test.ts`** — exercises the interplay between refund rules and the dispute constraints defined here.

## Notes

- **Inquiry ≠ chargeback for refund gating.** Only an open *chargeback* blocks new refunds. An open inquiry leaves refunds fully allowed, and a full refund ends the inquiry.
- **`hasDecidedDispute` is not the same as "has any dispute."** It requires that no open chargeback remains; it is the predicate that clears a refund's `disputed` refusal state.
- **`lostToChargebacks` only counts terminal losses.** A `won` or `accepted`-then-reversed chargeback naturally contributes zero because it is absent from `LOSS_DISPUTE_STATUSES`; no special handling needed.
- **All functions are pure.** No Date, no random, no I/O. Safe to call in any order and to unit-test in isolation.
- **`openDisputeFilter` returns a plain `Record<string, unknown>`**, not a typed Mongoose filter, so callers must cast or use it directly in a `.find()` call.
