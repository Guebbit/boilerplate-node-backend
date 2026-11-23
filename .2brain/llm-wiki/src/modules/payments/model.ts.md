---
source: src/modules/payments/model.ts
source_sha256: ee845e14c2a3d0d684098052115dae6f35988229304ae367ca89877a68bf4373
context_sha256: 8872668a2a912183d1da1100e1060bf3559fb2a5400e40198a4c6e22b3564500
generated_at: 2026-11-22T06:46:03.372148+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/model.ts

## Purpose
Mongoose model and TypeScript types for the payments module. There is one payment document per order, enforced by a `unique` index on `orderId`, so a retry after a decline re-confirms the same document instead of creating a second one. The status vocabulary is the provider-facing lifecycle (`requires_confirmation`, `requires_action`, `processing`, `succeeded`, `declined` as retryable, `canceled` as terminal). It is separate from the order's customer-facing status and comes from `PaymentStatus` in the `@types` contract, so the enum and the wire format cannot diverge.

## Key elements
- `PaymentDocument` (interface): the payment record. Fields:
  - Identity and amounts: `orderId`, optional `userId` (unset when the account is erased), `amount` and `currency` (frozen at intent creation), `amountRefunded`.
  - Status and provider: `status`, `provider`, `providerRef`, `method`.
  - Manual payments: `reference` and `receivedAt`, set only when a payment is recorded by hand.
  - Bank transfer: `transferReference` and `payBy`.
  - Card: `cardLast4`.
  - Embedded lists and dedup: `refunds`, `disputes`, `handledCancelEvents`.
- `RefundRecord` (interface): one record per refund attempt. It carries:
  - Money and status: `amount`, `currency`, `status`, `reason`.
  - Provider retry safety: `idempotencyKey`.
  - Return linkage: optional `returnId`, `lines` (`RefundLine[]`) and `shipping`.
  - Legal deadline: `dueBy` and `dueRule`.
  - Provider answer: `providerRefundRef` and `failureReason`.
  - Retry and fencing: `attempts`, `attemptedAt` (fence token) and `nextAttemptAt`.
  - Settlement: `settledByHand`, `paidOutside`, `settledAgainstDispute` and `settledAt`.
  - Reversal: `reversedAt` and `reversedAfterSettling`.
- `RefundLine` (interface): `productId` and `quantity` of a returned line, so a credit note can find the VAT rate.
- `DisputeRecord` (interface): a bank dispute embedded on the payment. It is unique per `disputeRef` and only overwritten by a newer report, using `observedAt` as the fence. It has `kind`, `status`, `reason`, `amount`, `evidenceDueBy`, `fundsWithdrawn`, `openedAt`, `closedAt` and `dashboardUrl`.
- `RefundSettlement` (interface): what settling a refund records beyond status. It holds the provider refund ref, the hand-settle flag, the dispute id, the attempt fence and the allowed `from` statuses.
- `PaymentModel` (type): `Model<PaymentDocument>`.
- `refundSchema`: the embedded refund sub-schema, built with `moneyPath`. It is addressed by its own `_id`. The rest of the schema definition and the model export are beyond the part of the file shown here.

## Relationships
- Imports `moneyPath` and `moneyPlugin` from `persistence/money-field` for decimal money fields, and `applySerialization` from `persistence/serialize`. It also imports `isPlainObject` from `object-guards`.
- Imports the enums and `PaidOutside` from `@types`: `PaymentStatus`, `PaymentMethod`, `RefundStatus`, `RefundReason`, `RefundFailureReason`, `RefundDueRule`, `OutsideMoneyMethod`, `Dispute*`.
- The file's own comments say that queries live in `./repository` and rules live in `./services`. The service files (`announce`, `disputes`, `effects`, `external-refunds`, `intent`, `list`, `notify`, `offline`), `repository.ts`, `presenter.ts` and `index.ts` are graph neighbors of the model. The visible content does not show how each one uses it.
- `scenarios/flows/backdate.ts` is also a graph neighbor. The visible content does not show how it relates.

## Notes
- Several fields are internal or staff-only and are never published on the wire: `providerRef`, `idempotencyKey`, `lines`, `shipping`, `attempts`, `attemptedAt`, `nextAttemptAt`, `settledAgainstDispute`, `handledCancelEvents` and the refund's `providerRefundRef`. `dueBy` reaches the wire only through the attention row. `transferReference` is published only inside `nextAction`.
- The provider's own error wording is never stored. `failureReason` is a closed code.
- `attemptedAt` is a fence token. A settle or failure write lands only on a `pending` record that still carries the same value, which stops a slow old attempt from overwriting a newer one.
- `reversedAt` is set once and never cleared. `reversedAfterSettling` distinguishes a bounce of a settled refund from a refusal while the refund was still open.
- `amountRefunded` counts a refund the moment it is opened. This stops two racing partial refunds from returning more than was paid.
- `handledCancelEvents` holds outbox ids, so a redelivered `order.canceled` event refunds nothing.
- `providerRef` is unique and indexed because webhooks look payments up by it. It is absent on `manual` payments.
- `payments` stores plain ids (`returnId`, `productId`) and does not reference the `returns` or `invoicing` modules.
