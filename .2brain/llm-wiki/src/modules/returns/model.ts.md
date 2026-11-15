---
source: src/modules/returns/model.ts
sha256: 79901d95f26aa3f445d27631aa4e37adb866dc28c642e72b01de10fb67fb709a
generated_at: 2026-11-14T21:35:01.264615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/model.ts

## Purpose

Defines the Mongoose schema, compiled model, and TypeScript interfaces for the **Return** document (a request to send goods back) and a **ReturnOrderLock** helper document. This file is purely declarative: it owns the data shape, indexes, and serialization contract, while all queries live in `repository.ts` and business rules in `services/`.

## Key elements

- **`ReturnLine`** — embedded line-item interface (productId, quantity, frozen title/unitPrice, optional `restocked`). Stored with `_id: false`; lines are never addressed individually.
- **`ReturnDocument`** — full document interface covering the lifecycle (`requested → approved → received → closed`, `→ declined`, `→ canceled`), reasons, kind (`return` | `cancellation`), postage payer, remedy, refund/deduction amounts, proof-of-sending fields, and all status timestamps.
- **`returnLineSchema`** / **`returnSchema`** — Mongoose schemas. Money fields (`unitPrice`, `handlingDeduction`, `refundAmount`, `shippingRefund`) use `moneyPath`. Enums are drawn from `@types`. Three indexes are defined: by `(orderId, createdAt)`, `(status, createdAt)`, and `(status, receivedAt)`.
- **`applyReturnTransform`** — wraps `applySerialization` to rename `_id`→`id`, drop `__v`, and **omit `shippingRefund`** from every serialized output.
- **`returnModel`** — the compiled model, registered as `"Return"`.
- **`ReturnOrderLockDocument` / `returnOrderLockModel`** — a one-row-per-order counter (`openings`) used as a write-write conflict detector so two concurrent `POST /returns` cannot both read "zero returns yet" under snapshot isolation. Never read back; only its `$inc` write matters.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — provides `moneyPath` (schema field factory) and `moneyPlugin` (Decimal128 storage) used by every monetary field in `returnSchema`.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is called to build `applyReturnTransform`, which the repository's lean reads apply.
- **`src/modules/returns/repository.ts`** — the sole consumer of `returnModel` and `returnOrderLockModel` for all read/write queries; applies `applyReturnTransform` on lean output.
- **`src/modules/returns/services/create.ts`** — writes new `ReturnDocument`s and `$inc`s the lock row.
- **`src/modules/returns/services/decide.ts`, `src/modules/returns/services/close.ts`, `src/modules/returns/services/cancel.ts`, `src/modules/returns/services/cancel-remainder.ts`, `src/modules/returns/services/proof.ts`, `src/modules/returns/services/outcome.ts`, `src/modules/returns/services/read.ts`, `src/modules/returns/services/notify.ts`, `src/modules/returns/services/personal-data.ts`** — each mutates or reads specific fields on the return document as defined here.
- **`src/modules/returns/presenter.ts`** — shapes the serialized return (post-transform) for API responses.
- **`src/modules/returns/index.ts`** — barrel re-export for the module.

## Notes

- **Keyed by `orderId`, never `userId`.** After account erasure the return record persists with no personal link; this is the Art. 17(3)(b)/(e) retention exemption shared with `invoicing`.
- **`shippingRefund` is internal bookkeeping** (prevents double-refunding delivery on multi-return orders) and is stripped from every wire response via `applyReturnTransform`. Never expose it manually.
- **`note` and `declineMessage` are free-text fields** that must never be rendered as HTML. `declineMessage` is unset by the reaper; `declineReason` (a code) survives.
- **Money is stored as Decimal128**; lean reads return decimal strings. Do not treat these fields as numeric in application logic without explicit conversion.
- **The lock document is not a business entity.** It has no indexes beyond the default `_id`, no timestamps, and should not appear in any query or serialization path.
