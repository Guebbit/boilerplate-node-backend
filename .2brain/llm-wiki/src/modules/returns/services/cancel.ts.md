---
source: src/modules/returns/services/cancel.ts
source_sha256: fa4edb20d8abc078ccc02fe1d82b641fdbd31eb860d5dd462a4d8175241e6cd9
context_sha256: da443529cb50c1ac227734923e27007118709e9b6d5b91c6d37992dd8432c9fe
generated_at: 2026-11-22T07:28:15.064189+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/cancel.ts

## Purpose
Implements staff cancellation of an approved return whose goods never arrived (`approved → canceled`). Without it, a return nobody will send would hold its units and keep the order at `in_progress` forever. It is bookkeeping only: no money, no stock, no event, no mail.

## Key elements
- `cancelReturn(id, note, context)` — the only export. Inside one `withTransaction`, it does a conditional `returnRepository.claimStatus` from `returnLifecycle.fromOf('cancel')` to `toOf('cancel')`, setting `canceledAt`. On success it appends a `return_canceled` timeline row to the order (ids only, actor = `context.caller.id`) in the same transaction. After the transaction it records an audit entry (action `ADMIN_RETURN_CANCELED`, with `orderId` and the optional `note`), calls `syncReturnStatus` for the order, and returns `generateSuccess(canceled, 200)`.
- `notCancelable(id)` — private. Builds the refusal when the claim matched nothing:
  - 404 `returns.not-found` if the return does not exist.
  - 409 `RETURN_REFUND_OPEN` if it is still `approved` and `proofOpenedRefund(existing)` is true.
  - 409 `RETURN_NOT_CANCELABLE` otherwise.

## Relationships
- `../repository` (`returnRepository`): `claimStatus` performs the atomic status change; `findById` is used to build the refusal.
- `../domain`: `returnLifecycle` supplies the from/to statuses. `PROOF_OPENS_REFUND_FOR` and `proofOpenedRefund` define the refund-owed condition.
- `src/modules/orders/index.ts`: supplies `orderService`, used to write the order timeline row in the same session.
- `./projection` (`syncReturnStatus`): re-syncs the order's return status after a successful cancel.
- `@infrastructure/runtime/database` (`withTransaction`): provides the transaction session.
- `@infrastructure/observability/audit` (`recordAudit`) and `../audit`: the audit action constant for the cancel entry.
- `@infrastructure/http/response`: `generateSuccess` and `generateReject` build the responses.
- `@infrastructure/i18n` (`t`): supplies the message strings.
- `../model` (`ReturnDocument`): the return type.

## Notes
- The refund guard is part of the claim filter, as a `$nor` on `proofOfSendingAt` existing and `reason` being in `PROOF_OPENS_REFUND_FOR`. This makes it atomic with the status change, so a refund opened by proof of sending cannot be canceled out from under it. `notCancelable` repeats the check only to pick the error code.
- If the claim loses a race, no timeline row is written, because the append runs in the same transaction and only when the claim succeeded.
- `canceled` is not `closed`. It holds no units and counts as no goods back, so the same lines can be returned again.
- A parcel lost in transit is not canceled. The shop bears that risk and a refund may be owed, so it should be received with a restock count of 0.
- The audit entry (including `note`) and `syncReturnStatus` run after the transaction commits, so they are not atomic with the cancel.
