---
source: src/modules/returns/services/proof.ts
source_sha256: e79107e1a33f9ef2e007ff8ae840273499661b9710fb2f1631160108327c68ae
context_sha256: f9067d3e132535bd38dc7eebc65ebe077691ccefc086dc4b3c20bf7ad0b3ceec
generated_at: 2026-11-22T07:31:33.394075+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/proof.ts

## Purpose
Records the buyer's proof of sending (the carrier's document for a parcel sent back) against an approved return, entered by staff. It is one-time and leaves the return `approved`, since the goods have not yet arrived. On a withdrawal, the proof opens the refund (Directive 2011/83/EU Art. 13(3): the shop may wait for the goods or the proof, whichever comes first). For defective or wrong items it only records the proof, because the remedy is decided at receipt.

## Key elements
- `ProofOfSendingInput`: staff-entered `sentAt` (date on the document), `carrier`, and `reference` (tracking or receipt number).
- `recordProofOfSending(id, input, context)`: the exported entry point. It validates, stamps the proof, audits, and (for withdrawals) sends the opened refund. It returns `ResponseSuccess<ReturnDocument>` or a `ResponseReject`:
  - 422 if `sentAt` is in the future (field error, `RETURN_PROOF_DATE_INVALID`).
  - 404 if the return or its order is not found.
  - 409 if the return is not awaiting its goods (`notReceivable()`).
  - 409 if a proof is already recorded (`RETURN_PROOF_ALREADY_RECORDED`).
- `stampProof` (internal): runs one transaction that does the following:
  1. For a withdrawal (`proofOpensRefund(reason)`), it locks the order row, loads the order's other returns, and quotes the refund with a `'0'` handling deduction.
  2. It calls `claimProof`, a conditional write that stamps the proof, plus `refundAmount` and `shippingRefund` when a quote exists.
  3. It appends a `proof_of_sending_recorded` timeline entry on the order.
  4. It opens a return refund through the payments module if the quoted total is above zero.
- `lostRace` (internal): when `claimProof` returns nothing, it re-reads the return. It answers 409 already-recorded if the proof now exists, otherwise `notReceivable()`.
- `optionalDue` (internal): spreads the legal refund deadline (`refundDueFor`, computed from the proof date) into the refund payload only when one exists.

## Relationships
- `../repository` (`returnRepository`): `findById`, `lockOrder`, `findByOrderId`, `claimProof`.
- `./receive`: reuses `quote` and `notReceivable`, so the refund quote matches the one made at receipt.
- `./refund-due`: `refundDueFor` supplies the refund deadline.
- `../domain`: `proofOpensRefund`, the lifecycle check that a return can still be received, and `wireLines`.
- `@modules/orders`: the order service (loads the order and appends the timeline entry), plus `buyerIdOf` and the `OrderDocument` type.
- `@modules/payments`: the payment service opens the refund (inside the transaction) and sends it (after commit); the `OpenedReturnRefund` type.
- `@modules/access`: `ownOrderFlag` adds a flag to the audit metadata.
- `@infrastructure/runtime/database`: `withTransaction`.
- `@infrastructure/observability/audit`: `recordAudit` with `ADMIN_RETURN_PROOF_RECORDED` from `../audit`.
- `@infrastructure/http/response` and `@infrastructure/i18n`: response builders and `t()` messages.
- `@domain-primitives/money`: `toMinorUnits` and `NO_MONEY` for the zero-total check.

## Notes
- The refund quote takes no handling deduction, so a refusal from `quote` is treated as unreachable and throws, which aborts the transaction.
- If the quoted total is zero (zero-priced lines), no refund record is opened.
- The refund is sent after the commit. If sending fails, the file does not handle it here; the comment says a refusal is left to the payment sweep.
- The future-date check runs before the 404 lookup result is examined, so it takes precedence over a missing return.
- The audit entry is recorded only on success, with `opensRefund` showing whether a refund was opened.
