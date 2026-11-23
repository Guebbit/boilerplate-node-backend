---
source: src/modules/orders/services/remove.ts
source_sha256: 762b3c46aa016cce0a77c5b06f9c63f8def6abd16608967c61a8461cae4b2922
context_sha256: 5229a5e421b4ef13adde8c11b7b34f417e42945a4e9a5932a435c2a3875f5a84
generated_at: 2026-11-22T06:23:05.200091+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/remove.ts

## Purpose
Implements deleting an order and undoing a soft delete. Orders are financial records, so the default is a soft delete (`deletedAt` stamped once). A hard delete is allowed only for an order that was canceled and never paid.

## Key elements
- `remove(order, hardDelete = false, context?)`: the raw write beneath `removeById`, marked `@internal`. It takes an already-loaded order.
  - **Hard delete**: refused unless `hardDeletable(order)`. It then calls `hardDeleteCanceled`, and on success records an `ORDER_DELETED` audit with `hardDelete: true` and returns `200` with `undefined`.
  - **Soft delete**: if `deletedAt` is already set, it returns `200` with the order unchanged, so retries are safe. If `softDeletable(order)` is false, it returns `409 ORDER_NOT_CANCELED`. Otherwise it sets `deletedAt = new Date()`, saves, records an `ORDER_DELETED` audit with `hardDelete: false`, and returns the saved order.
- `removeById(id, hardDelete?, context?)`: loads the order by id, answers `404` if it is absent, then delegates to `remove`.
- `restoreById(id, context?)`: undoes a soft delete by clearing `deletedAt`. It answers `404` when the order is missing and `409 ORDER_NOT_DELETED` when it is not soft-deleted. On success it records an `ORDER_RESTORED` audit.
- `hardDeleteRefusal(order)` (private): returns the reason a hard delete is refused, or `undefined` if it may go. In priority order:
  - `paidAt` set: `409 ORDER_INVOICED`
  - `moneyReceivedAt` set: `409 ORDER_HAS_MONEY_HISTORY`
  - otherwise: `409 ORDER_NOT_CANCELED`
- `hardDeleteCanceled(order)` (private): performs a single conditional delete via `orderRepository.deleteCanceledUnpaid`. On success it also deletes the order's timeline. On a miss it re-reads the order to say why: the refusal from `hardDeleteRefusal`, or `404` if the order is gone.
- `orderMissing` and `orderNotCanceled` (private): helpers that build the `404` and `409` rejections.

## Relationships
- `../domain` (`deletion.ts`, via `index.ts`): provides the `hardDeletable` and `softDeletable` predicates that decide eligibility.
- `../repository`: supplies `findById`, `save` and `deleteCanceledUnpaid`.
- `./timeline`: `deleteTimelineOf` removes the order's timeline after a successful hard delete.
- `../model`: supplies the `OrderDocument` type.
- `../audit` (`src/modules/orders/audit.ts`) and `@infrastructure/observability/audit`: `recordAudit` is called with the `ORDER_DELETED` or `ORDER_RESTORED` action from the orders audit actions.
- `@infrastructure/http/response`: `generateSuccess` and `generateReject` build every return value.
- `@infrastructure/i18n`: `t(...)` localizes the error messages.
- `@types` (`src/types/index.ts`, `auth-context.ts`): supplies the `CallerContext` passed through for auditing.
- Tests: `remove-race.test.ts` and `service-crud.test.ts` (integration) cover this file.

## Notes
- Both delete kinds require the order to be `canceled`. Cancel owns the end-of-order effects (stock release, payment intent, webhook), and `remove` does none of them.
- A hard delete is refused once `paidAt` is set because `invoicing` freezes an invoice from that transition. `paidAt` alone is enough, with no need to ask `invoicing`.
- The hard delete is one conditional write, which guards against the order changing between the read and the write. The re-read on a miss then reports the real reason.
- The audit `context` is optional. Omit it for callers with no request behind them.
- The doc comment says the barrel publishes only the door (`removeById`), not `remove`.
