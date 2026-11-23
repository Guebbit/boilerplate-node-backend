---
source: src/modules/payments/services/disputes.ts
source_sha256: 0f14e384598be98ee30306787804118d516210ba4b220d6f72f61a773a0df488
context_sha256: b6d0afcd2af68971003f31bb676c2672297a6ec724696d26f8676e7ec3f7ad8e
generated_at: 2026-11-22T06:49:38.457338+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/disputes.ts

## Purpose
Handles disputes (chargebacks/inquiries) as reported by the payment provider. A verified delivery carrying a dispute's state is stored on its payment, a staff timeline row is written, and events are announced, all in one transaction. The provider's report is taken from the delivery body itself, and ordering is by the stored `observedAt`, not arrival order. A dispute is not a refund: it never touches `amountRefunded`, the order status or a credit note. It only changes what a refund may do (rules live in `src/modules/payments/domain/disputes.ts`).

## Key elements
- `applyDisputeDelivery(payment, report)`: exported entry point. Converts the report to a record, stores it, and logs whether it was applied or ignored as stale.
- `disputeStanding(paymentId)`: exported. Reads the payment unscoped and returns `{ open, currency }` (whether any dispute, an inquiry included, is still open), or `undefined` if the payment is missing.
- `recordOf`: turns a `ProviderDisputeState` into a `DisputeRecord`: dates revived, `openedAt` and `observedAt` both set from `observedAt`, `closedAt` stamped for won/lost/accepted/closed (`CLOSED_DISPUTE_STATUSES`), optional `evidenceDueBy` and `dashboardUrl`.
- `storeDispute`: runs `announceInTransaction`: `paymentRepository.recordDispute`, then timeline rows, then the refunds-owed computation. Returns `null` when the report was stale or repeated.
- `timelineTypes` / `appendRows`: add `dispute_opened` on a first report and `dispute_closed` when the dispute newly reads closed (closed to closed adds none), written with the session.
- `flipsToWon`, `owedOf`, `owedAfter`: work out which refunds are owed again. This happens on a newly closed dispute or a lost-to-won flip. `owedAfter` re-reads the payment inside the transaction. `owedOf` combines `refundsOwedAfterWin` and `refundsOwedAfterDispute`, marking the latter `followsFlip: true`.
- `payloadOf` / `announcementsOf`: build outbox announcements: `PAYMENT_DISPUTE_OPENED` (first write) or `PAYMENT_DISPUTE_UPDATED`, plus one `PAYMENT_REFUND_OWED_AFTER_DISPUTE` event per owed refund. All use the order ID as `aggregateId`.

## Relationships
- `src/modules/payments/repository.ts` (`paymentRepository`): `recordDispute` does the conditional write, `findByOrderId` re-reads the payment in the session, `findByIdScoped` backs `disputeStanding`. `RecordedDispute` describes the write outcome.
- `src/modules/payments/domain/index.ts`: `isOpenDispute`, `hasOpenDispute`, `bankKeptMoney`, `refundsOwedAfterDispute`, `refundsOwedAfterWin` and the `RefundOwedAfterDispute` type supply the dispute and refund rules.
- `src/modules/payments/events.ts`: event name constants and `DisputeEventPayload`.
- `src/kernel/outbox.ts`: `announceInTransaction` and `OutboxAnnouncement` give transactional announcement.
- `src/modules/orders/index.ts`: `orderService`, used to write the timeline rows.
- `src/modules/payments/model.ts` / `src/modules/payments/providers/index.ts`: `DisputeRecord`, `PaymentDocument`, `ProviderDisputeState` types.
- `src/domain-primitives/money.ts`: `padDecimal` formats amounts for payloads and timeline data.
- `src/infrastructure/adapters/logger.ts`: logs the outcome.
- `src/types/index.ts`: `DisputeStatus` enum.

## Notes
- Inside a transaction the timeline rows are appended one after another, because a session does not take parallel operations.
- The refunds-owed check reads the payment again inside the transaction, because the snapshot from the delivery predates the write.
- A report in a different currency from the payment's is stored like any other. Only the refund arithmetic skips it (see `lostToChargebacks`), and staff check its amount in the provider's dashboard.
- The log call is wrapped in Stryker disable/restore comments, so mutation testing skips it.
