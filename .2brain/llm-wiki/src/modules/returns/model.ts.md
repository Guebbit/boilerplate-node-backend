---
source: src/modules/returns/model.ts
sha256: 1498ed87e41cef9d872127f2df1ac96b1e7e6894a348c048b682470da4a2d54d
generated_at: 2026-10-29T05:39:27.093917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/model.ts

## Purpose

Defines the Mongoose schema, compiled model, and serialization transform for **Return** documents (one per return/cancellation request, keyed by `orderId`). Also declares a small **ReturnOrderLock** model that serializes concurrent `POST /returns` calls via a write-conflict counter. All domain rules and queries live elsewhere (`./services`, `./repository`); this file is the persistence contract.

## Key elements

- **`ReturnLine`** / **`returnLineSchema`** — embedded sub-document (no `_id`) capturing a product snapshot: `productId`, `quantity`, `title`, `unitPrice` (Decimal128), optional `restocked`.
- **`ReturnDocument`** / **`returnSchema`** — the main document. Enum fields (`status`, `reason`, `kind`, `returnPostage`, `openedBy`, `remedy`, etc.) are backed by the `@types` unions. Money fields (`unitPrice`, `handlingDeduction`, `refundAmount`, `shippingRefund`) use `moneyPath`. Lifecycle timestamps (`requestedAt`, `decidedAt`, `receivedAt`, `closedAt`, `canceledAt`) track state transitions.
- **`returnModel`** — compiled Mongoose model registered as `'Return'`.
- **`applyReturnTransform`** — lean-read serializer: renames `_id`→`id`, strips `__v`, and **omits `shippingRefund`** (internal anti-double-refund bookkeeping, never sent on the wire).
- **`ReturnOrderLockDocument`** / **`returnOrderLockModel`** — one row per order (`_id` = order id) with an `openings` counter. Used solely to create a write-write conflict so the driver retries the second concurrent return creation. Never exposed, never read back.
- **Indexes** — `orderId+createdAt` (per-order lookups, account export), `status+createdAt` (staff queue), `status+receivedAt` (daily stats).

## Relationships

- **`money-field.ts`** — provides `moneyPath` (field definition) and `moneyPlugin` (Decimal128 cast on write / Number on lean read). Applied to every monetary field.
- **`serialize.ts`** — `applySerialization` builds `applyReturnTransform`; the repository factory calls it on every lean read.
- **`repository.ts`** — imports `returnModel` and `returnOrderLockModel` to perform all queries; imports `applyReturnTransform` for read shaping.
- **`services/create.ts`** — writes new returns and `$inc`s the lock row first.
- **`services/decide.ts`**, **`services/receive.ts`**, **`services/close.ts`**, **`services/cancel.ts`**, **`services/cancel-remainder.ts`** — mutate the fields documented here (`status`, `decidedAt`, `receivedAt`, `refundAmount`, `remedy`, `handlingDeduction`, `closedAt`, `canceledAt`, etc.).
- **`services/personal-data.ts`** / **`services/notify.ts`** — read return fields for GDPR erasure checks and outbound notifications.
- **`presenter.ts`** — maps `ReturnDocument` fields into API-facing shapes; relies on `applyReturnTransform` having already stripped `shippingRefund`.
- **`index.ts`** — barrel re-export for the module's public surface.

## Notes

- **Never keyed by `userId`.** The document is linked only via `orderId`. After account erasure the return persists with no personal link (Art. 17(3)(b)/(e) retention), same as an `invoicing` record.
- **`shippingRefund` is internal.** It is stored to prevent double-refunding delivery, but `applyReturnTransform` always strips it. Do not rely on it being present in API payloads.
- **`declineMessage` is free text** and is unset by the reaper; `declineReason` is a stable enum code that survives reaping.
- **Withdrawals** (`reason: withdrawal`) are born in `approved` status — they skip the `requested` phase entirely.
- **Lock model is fire-and-forget.** Its only observable effect is the write conflict; the `openings` counter is never read or reset.
- All queries and business rules are deliberately kept out of this file (see `./repository` and `./services`).
