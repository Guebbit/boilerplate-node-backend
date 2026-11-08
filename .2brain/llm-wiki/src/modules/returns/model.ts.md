---
source: src/modules/returns/model.ts
sha256: d9259baa30a8f460e8fd0fa2d6f9e184d537db01a5018eb20f3e492c6ec791dc
generated_at: 2026-11-08T07:59:59.586594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/model.ts

## Purpose

Defines the Mongoose schema, TypeScript interfaces, and compiled models for a **Return** — the record of a customer's request to send goods back (or cancel an unshipped remainder). It also defines a lightweight `ReturnOrderLock` collection used as a write-conflict primitive to serialise parallel return openings against the same order. The schema encodes the full lifecycle (`requested → approved → received → closed`, with `declined` and `canceled` branches) and all decision-making fields so that queries and business rules (in `./services`) can operate on a single document.

## Key elements

- **`ReturnLine`** — embedded interface: one product line coming back (`productId`, `quantity`, frozen `title`/`unitPrice`, optional `restocked`). Stored as an array with `_id: false`.
- **`ReturnDocument`** — the full document interface: identity (`orderId`, `orderNumber`, `currency`), state (`status`, `reason`, `kind`), timing (`requestedAt`, `decidedAt`, `receivedAt`, `closedAt`, `canceledAt`), money fields (`handlingDeduction`, `refundAmount`, `shippingRefund`), decision metadata (`openedBy`, `policyExceptions`, `declineReason`, `remedy`, `returnPostage`), and the `lines` array.
- **`returnSchema`** — the Mongoose schema with enum constraints, `moneyPath` for all monetary fields, and three compound indexes (`orderId+createdAt`, `status+createdAt`, `status+receivedAt`). Registered via `moneyPlugin` (Decimal128).
- **`applyReturnTransform`** — built from `applySerialization`; maps `_id → id`, drops `__v`, and **omits `shippingRefund`** from all serialised output.
- **`returnModel`** — the compiled `Model<ReturnDocument>` registered as `'Return'`.
- **`ReturnOrderLockDocument` / `returnOrderLockModel`** — a minimal `{ _id: orderId, openings: number }` collection. Never read back; its only purpose is to create a write-write conflict under Mongo's snapshot isolation so two concurrent `POST /returns` calls for the same order serialise correctly.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — supplies `moneyPath` (schema-field factory for Decimal128 money) and `moneyPlugin` (hydrates/serialises to string). All monetary paths in `returnSchema` and `returnLineSchema` use these.
- **`src/infrastructure/persistence/serialize.ts`** — supplies `applySerialization`, which `applyReturnTransform` wraps to add the `shippingRefund` omission.
- **`src/modules/returns/repository.ts`** — the sole consumer of `returnModel` and `returnOrderLockModel` for queries and the lock `$inc`.
- **`src/modules/returns/services/create.ts`** — writes a new `ReturnDocument` and performs the lock `$inc` before insertion.
- **`src/modules/returns/services/decide.ts`**, **`close.ts`**, **`receive.ts`**, **`cancel.ts`**, **`cancel-remainder.ts`** — update document fields (status, timestamps, money, remedy) through the repository.
- **`src/modules/returns/services/read.ts`**, **`notify.ts`**, **`outcome.ts`**, **`personal-data.ts`** — read `ReturnDocument` instances, typically passing them through `applyReturnTransform` for wire output.
- **`src/modules/returns/presenter.ts`** — consumes `ReturnDocument` / `ReturnLine` shapes to build API responses.
- **`src/modules/returns/index.ts`** — barrel re-export of the public API from this file.

## Notes

- **Keyed by `orderId`, never `userId`.** The module docblock explicitly states this is the Art. 17(3)(b)/(e) retention exemption: after account erasure the record has no personal link, same treatment as the `invoicing` module.
- **`shippingRefund` is internal.** It exists to prevent double-refunding delivery on multi-return orders. `applyReturnTransform` strips it from every serialised response; it should never appear in API payloads or the `Return` type contract.
- **`note` and `declineMessage` are free text, never rendered as HTML.** `note` is customer-authored and untrusted.
- **Withdrawal is born `approved`.** A `reason: 'withdrawal'` return skips the `requested` state entirely; `decidedAt` is set to the opening moment.
- **Money fields are Decimal128 in storage, string on the wire.** Lean reads return decimal text; always go through `moneyPlugin` / `moneyPath` — do not cast to `Number`.
- **`ReturnOrderLock` is fire-and-forget.** There is no read path for it. Its existence is purely to force a write-write conflict under snapshot isolation; the `openings` counter is never surfaced to any consumer.
