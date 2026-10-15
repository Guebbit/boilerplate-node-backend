---
source: src/modules/returns/model.ts
sha256: 6d2c076a9ae572740ee2848f86cd8da6cc21900b8d298f1d3aca5445cb67eed6
generated_at: 2026-10-15T11:54:01.339894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/model.ts

## Purpose

Defines the Mongoose schema, interfaces, and compiled model for a **Return** — the record of a customer's request to send goods back (or cancel an unshipped remainder). It also defines a per-order lock document used to serialise concurrent `POST /returns` calls. This file is purely structural: no queries, no business rules — those live in `./repository` and `./services`.

## Key elements

- **`ReturnLine`** — embedded sub-document: `productId`, `quantity`, `title`, `unitPrice`. A frozen snapshot of what is coming back; `_id: false`, never addressed individually.
- **`ReturnDocument`** — full document shape: identity (`orderId`, `orderNumber`, `currency`), state (`status`, `reason`, `kind`), lines, postage payer, decision/receipt/closure timestamps, and monetary fields (`handlingDeduction`, `refundAmount`, `shippingRefund`).
- **`returnLineSchema` / `returnSchema`** — Mongoose schemas. Money fields use `moneyPath`; the schema is decorated with `moneyPlugin` (Decimal128 storage). Three compound indexes are declared for the order view, the staff queue, and daily-receipt stats.
- **`applyReturnTransform`** — built via `applySerialization`; maps `_id → id`, strips `__v`, and **omits `shippingRefund`** so it never appears on the wire.
- **`returnModel`** — the compiled Mongoose model, registered under the name `'Return'`.
- **`ReturnOrderLockDocument` / `returnOrderLockModel`** — a single-row-per-order counter (`openings`). Two parallel `POST /returns` both `$inc` this row; the resulting write-write conflict forces the second writer to re-read and see the first's return, preventing write-skew under snapshot isolation. The document is never exposed or read back.
- **`ReturnModel` / `ReturnOrderLockModel`** — typed Mongoose model aliases for repository/service use.

## Relationships

- **`money-field.ts`** — imports `moneyPath` (schema field factory) and `moneyPlugin` (Decimal128 storage / lean-read conversion).
- **`serialize.ts`** — imports `applySerialization` to build `applyReturnTransform`.
- **`@modules/shop`** — imports `RETURN_POSTAGE_PAYERS` and the `ReturnPostagePayer` type for the `returnPostage` enum.
- **`@types`** — imports `ReturnKind`, `ReturnReason`, `ReturnStatus` enums used as schema enums and interface members.
- **`./index.ts`** — re-exports the model, interfaces, and transform for module consumers.
- **`./repository.ts`** — the sole consumer of `returnModel` and `returnOrderLockModel` for reads/writes.
- **`./services/*`** (`create`, `decide`, `receive`, `close`, `cancel-remainder`, `outcome`, `personal-data`, `read`) — construct or read `ReturnDocument` instances and rely on the interface shapes defined here.
- **`./presenter.ts`** — maps a `ReturnDocument` (post-`applyReturnTransform`) to the public wire shape.
- **`orders/index.ts` / `orders/config.ts`** — the `orderId` reference points into the Order collection; the lock model's `_id` is the Order's own id.

## Notes

- **Keyed by `orderId`, never `userId`.** After account erasure the return record intentionally has no personal link; it is an Art. 17(3)(b)/(e) legal/accounting retention exemption, same category as `invoicing`.
- **`shippingRefund` is internal bookkeeping** (prevents double-refunding delivery on the last-unit return). It is stripped by `applyReturnTransform` and must not appear in any public response.
- **`returnPostage` is frozen at creation** from the `NODE_RETURN_POSTAGE_PAYER` env value — it records what the customer was told *before* the return, not the current config.
- **The lock document is fire-and-forget.** Its only observable effect is the write conflict; it is never queried, projected, or returned to a client.
- **Lines have no `_id`.** They are an immutable snapshot; nothing in the codebase addresses a line by its own identifier.
