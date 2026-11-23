---
source: src/modules/returns/domain/refund-due.ts
source_sha256: 96ff8459963dd1227bc1a0d9ab459d46e92b8836c7cb8061ea05daff5bfb0cf8
context_sha256: b04334c88bfea8cfec3329530426f35539af9d9caa13d448c51991591528cc5e
generated_at: 2026-11-22T07:24:11.020635+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/refund-due.ts

## Purpose
Pure domain logic that decides when the refund of a return is legally due, and under which rule. It encodes the withdrawal rule (Directive 2011/83/EU Art. 13) and the defective or wrong-item rule (Directive 2019/771 Art. 16(3)(b)). The shop may wait for the goods or the buyer's proof of sending, whichever comes first. Waiting never moves the last date: goods or proof that arrive later make the refund due the moment they arrive.

## Key elements
- `RefundDueInput` — input shape: `reason`, optional `withdrawalDueBy`, `receivedAt` and `proofOfSendingAt`. The caller computes `withdrawalDueBy`, because a domain file reaches no module. It is read for withdrawals only.
- `ReturnRefundDue` — result shape: `dueBy: Date` and `dueRule: RefundDueRule`. It is the stamp `payments` stores on the record.
- `PROOF_OPENS_REFUND_FOR` — the list of reasons whose proof of sending opens the refund. It currently holds only `'withdrawal'`.
- `proofOpensRefund(reason)` — true when a proof of sending opens the refund for that reason.
- `proofOpenedRefund(returned)` — true when a proof date is present and the reason is one a proof opens. Receiving the goods then neither quotes nor opens a refund again. It accepts `Date | string`, because only the proof's presence is checked.
- `refundDueByOf(input)` — the main function. It returns a `ReturnRefundDue` or `undefined`:
  - **withdrawal:** the later of `withdrawalDueBy` and the earliest of `receivedAt` and `proofOfSendingAt`, with rule `'withdrawal'`. It returns `undefined` if `withdrawalDueBy` is missing.
  - **guarantee reasons** (per `isGuaranteeReason`): `dueBy` is the earliest of `receivedAt` and `proofOfSendingAt`, with rule `'faulty'`. It returns `undefined` if neither exists yet.
  - **any other reason (goodwill):** `undefined`, meaning no deadline.
- `earliestOf` — a private helper that returns the earliest defined date.

## Relationships
- `src/modules/returns/domain/reasons.ts` — supplies `isGuaranteeReason`, which decides whether the `'faulty'` rule applies.
- `src/types/index.ts` — supplies the `RefundDueRule` and `ReturnReason` types, imported via the `@types` alias.
- `src/modules/returns/domain/index.ts` — the domain barrel, which is the likely re-export point. The file content does not show this.
- `src/modules/returns/services/refund-due.ts`, `cancel.ts`, `proof.ts`, `read.ts`, `receive.ts` (all under `src/modules/returns/services/`) — services in the same module that are graph neighbors, and so presumably consume these helpers. The file itself does not show how they use them.
- `src/modules/returns/tests/unit/refund-due.test.ts` — the unit tests for this file.

## Notes
- A withdrawal where the buyer sends nothing and shows no proof gets `dueBy = withdrawalDueBy`. Per the file's header comment, such a buyer leaves the shop holding the refund with no time limit.
- A defective or wrong item with no goods and no proof yet yields `undefined`, not a date.
- Only a withdrawal's proof of sending opens the refund. For a defective or wrong item, repair or replacement is decided on receipt.
- The arrival date used for the `'faulty'` rule is the earliest of `receivedAt` and `proofOfSendingAt`, even though the proof rule is stated separately in `PROOF_OPENS_REFUND_FOR`. `refundDueByOf` does not consult `proofOpensRefund`.
