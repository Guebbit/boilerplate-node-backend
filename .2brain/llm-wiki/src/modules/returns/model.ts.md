---
source: src/modules/returns/model.ts
source_sha256: b8005895d4218c69ec39f92e22ddf64663e9cdc819593149d9f05d754ba4fd26
context_sha256: e804cc3e53be7b9d5d7d46b4a971604b1c817399440a4d1be3459215ec4c02b9
generated_at: 2026-11-22T07:25:48.641642+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/model.ts

## Purpose
Defines the persisted `Return` — a request to send goods back (or a canceled unshipped remainder) and its state. There is one document per request, keyed by `orderId` and never by `userId`, so erasing an account leaves no personal link. This follows the Art. 17(3)(b)/(e) retention exemption that `invoicing` documents. The file also defines an internal per-order lock model used to serialize concurrent openings.

Lifecycle: `requested → approved → received → closed`, or `requested → declined`, or `approved → canceled`. A withdrawal (`reason: withdrawal`) is born `approved` after dispatch and `closed` before. Transitions are governed by `src/domain-primitives/lifecycle.ts`, not by this file.

## Key elements
- `ReturnLine` — embedded snapshot of a returned line: `productId`, `quantity`, `title`, frozen `unitPrice`, and `restocked`, which is absent until receipt.
- `ReturnDocument` — the document interface. Its main fields:
  - Identity and context: `orderId`, `orderNumber`, `currency`, `kind` (`return` or `cancellation`), `fulfillmentOrderId`.
  - State: `status`, `reason`, `openedBy`, `policyExceptions`, `statedVia`.
  - Free text: `note`, `declineMessage`.
  - Decline code: `declineReason`.
  - Remedy: `preferredRemedy`, `remedy`.
  - Money (decimal strings): `handlingDeduction`, `refundAmount`, `shippingRefund`.
  - Proof of sending: `proofOfSendingAt`, `proofCarrier`, `proofReference`.
  - Timestamps: `requestedAt`, `decidedAt`, `receivedAt`, `closedAt`, `canceledAt`, `createdAt`, `updatedAt`.
- `ReturnModel` — `Model<ReturnDocument>` type alias.
- `returnSchema` — Mongoose schema.
  - Enum fields use the `Return*` enums from `@types`.
  - Money fields use `moneyPath`; the `moneyPlugin` is applied to the schema.
  - Defaults: `status: requested`, `kind: return`, `openedBy: buyer`, `requestedAt: Date.now`, `policyExceptions: []`.
  - Length limits: `note` 1000, `declineMessage` 500, `proofCarrier` and `proofReference` 200.
  - `timestamps: true`.
- Indexes:
  - `returns_orderId_createdAt` — all returns on an order.
  - `returns_status_createdAt` — staff queue.
  - `returns_status_receivedAt` — stats on returned units by receipt day.
- `applyReturnTransform` — `applySerialization` with `shippingRefund` omitted, so that field never reaches the wire.
- `returnModel` — compiled model registered as `Return`.
- `ReturnOrderLockDocument` / `ReturnOrderLockModel` / `returnOrderLockModel` — per-order lock row registered as `ReturnOrderLock`. Its `_id` is the order's id and it holds an `openings` counter.

## Relationships
- Imports `applySerialization` from `infrastructure/persistence/serialize` and `moneyPath` / `moneyPlugin` from `infrastructure/persistence/money-field`. Money is stored as Decimal128 and read back as decimal text.
- `repository.ts` holds the queries; the doc comments say the repository factory's lean reads are why `applyReturnTransform` exists.
- `services/*` hold the business rules and operate on these documents. The doc comments place the following in `services/`:
  - `collect` — feeds the account export through the `orderId` index.
  - The `POST /returns` opening path — takes the `ReturnOrderLock` row.
  - The rest of `services/`, including `create`, `decide`, `cancel`, `cancel-remainder`, `close`, `proof`, `outcome`, `notify`, `personal-data` and `read`, is listed as a graph neighbor.
- `presenter.ts` and `index.ts` are graph neighbors. The file itself does not reference them.

## Notes
- Keyed by `orderId` only, on purpose, for the erasure and retention reasoning above.
- `shippingRefund` is internal. It is non-zero on the one return or cancellation that took the last unit of the order, which prevents refunding delivery twice.
- `returnPostage` is frozen at creation from `NODE_RETURN_POSTAGE_PAYER`.
- `requestedAt` is server-stamped for buyers. Staff recording a phone call or letter give the day it was made. Deadlines are judged on it.
- `declineReason` is a code and outlives the reaper. `declineMessage` is free text, which the reaper unsets.
- `proofCarrier` and `proofReference` are present exactly when `proofOfSendingAt` is. The proof is recorded once.
- Mongo transactions use snapshot isolation, so two parallel openings could both read "nothing returned yet" and both commit (write skew). Each opening `$inc`s the lock row first. The resulting write-write conflict is retried by the driver, so the second opening sees the first one's return. The lock row is never exposed or read back.
- A `replace` or `repair` remedy hands the units back to the buyer, so the return holds nothing from then on.
