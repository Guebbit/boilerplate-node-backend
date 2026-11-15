---
source: src/modules/returns/domain/refund-due.ts
sha256: 4a72fb285d26833fe4c684c4df5ad72d6af1c05bbc5725f9f929431c74d12611
generated_at: 2026-11-14T21:34:08.719041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/refund-due.ts

## Purpose

Pure domain logic that determines when a return's refund is legally due and under which rule. Encodes the deadlines set by EU Directive 2011/83/EU Art. 13 (14-day withdrawal) and Directive 2019/771 Art. 16(3)(b) (defective/wrong item), per Commission guidance 2021/C 525/01 §5.5.3. No I/O, no module access — it receives already-resolved dates and returns a stamp or `undefined`.

## Key elements

- **`RefundDueInput`** — the read-only shape the caller assembles: `reason`, optional `withdrawalDueBy`, `receivedAt`, `proofOfSendingAt`.
- **`ReturnRefundDue`** — the stamp shape (`dueBy` + `dueRule`) that `payments` writes onto the record.
- **`PROOF_OPENS_REFUND_FOR`** — frozen list (`['withdrawal']`) of reasons for which a carrier's proof of sending opens the refund clock.
- **`proofOpensRefund(reason)`** — membership check against `PROOF_OPENS_REFUND_FOR`; returns a boolean that is only positive for `'withdrawal'`.
- **`proofOpenedRefund(returned)`** — checks whether a proof is already recorded *and* the reason qualifies, so that receiving goods does not re-open the refund.
- **`refundDueByOf(input)`** — the main entry point. Returns `ReturnRefundDue | undefined`:
  - *Withdrawal*: the later of `withdrawalDueBy` and the earliest arrival (goods or proof) — waiting never moves the date earlier.
  - *Faulty / wrong item* (`isGuaranteeReason`): due at the moment goods or proof first arrived; `undefined` if neither has arrived yet.
  - *Any other reason (goodwill)*: `undefined` (no statutory deadline).
- **`earliestOf`** (internal) — picks the earliest present `Date` from a variadic list.

## Relationships

- **`src/modules/returns/domain/reasons.ts`** — imports `isGuaranteeReason` to classify defective/wrong-item reasons.
- **`src/types/index.ts`** — imports `RefundDueRule` and `ReturnReason` type definitions.
- **`src/modules/returns/domain/index.ts`** — re-exports this module's public API to the rest of the domain barrel.
- **`src/modules/returns/services/refund-due.ts`** — the service layer that assembles `RefundDueInput` from persisted state and calls `refundDueByOf`.
- **`src/modules/returns/services/receive.ts`** — records `receivedAt`; relies on `proofOpenedRefund` to avoid double-opening.
- **`src/modules/returns/services/proof.ts`** — records `proofOfSendingAt`; consulted via `proofOpenedRefund` before stamping.
- **`src/modules/returns/services/cancel.ts`** / **`src/modules/returns/services/read.ts`** — read or mutate return state that feeds into the `RefundDueInput` shape.
- **`src/modules/returns/tests/unit/refund-due.test.ts`** — unit tests covering the deadline matrix and edge cases.

## Notes

- The module is deliberately pure: it never reaches into `orders` or other modules. The caller is responsible for resolving `withdrawalDueBy` from the order's `withdrawalRefundDueBy` field.
- `proofOpenedRefund` accepts `proofOfSendingAt` as `Date | string | undefined` so that a raw wire row (ISO string) can be passed without coercion — only its *presence* is read.
- For a withdrawal, if the buyer sends nothing and records no proof, `refundDueByOf` still returns the `withdrawalDueBy` date (the refund becomes due at that point with no extension).
- `earliestOf` uses `toSorted` (non-mutating); the input array is never reordered.
- The JSDoc on `RefundDueInput.withdrawalDueBy` notes it is "read for a withdrawal only" — passing it for other reasons has no effect.
