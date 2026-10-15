---
source: src/modules/orders/services/remove.ts
sha256: 8ed9c439f8e7b73fd06fb35ab969d27f4ce3a4fa02d794b84a51c154b51356db
generated_at: 2026-10-15T11:10:12.643942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/remove.ts

## Purpose

Provides the delete and restore operations for orders. Because an order is a financial record, the default is a **soft delete** (stamping `deletedAt`, reversible via `restoreById`); a **hard delete** is restricted to orders that are `cancelled` and never paid. This file centralises the refusal logic, the conditional delete, the audit trail, and the caller-rank check that guards both paths.

## Key elements

- **`remove(order, hardDelete?, context?)`** — Core delete. Soft path: idempotent, stamps `deletedAt` once, saves, records `ORDER_DELETED`. Hard path: checks refusal, calls `orderRepository.deleteCancelledUnpaid`, deletes the timeline, records audit. Returns `ResponseSuccess` or `ResponseReject`.
- **`restoreById(id, context?)`** — Clears `deletedAt` to undo a soft delete. Enforces caller-rank (`outrankedOrderRefusal`) and requires the order to actually be soft-deleted (409 otherwise). Records `ORDER_RESTORED`.
- **`removeById(id, hardDelete?, context?)`** — Convenience wrapper: fetches the order by ID, applies the outranked refusal, then delegates to `remove`.
- **`hardDeleteRefusal(order)`** (internal) — Returns `409 ORDER_INVOICED` if `paidAt` is set, `409 ORDER_NOT_CANCELLED` if status ≠ `cancelled`, or `undefined` to proceed.
- **`hardDeleteCancelled(order)`** (internal) — Executes the conditional delete; on a miss re-reads the row to return the specific refusal (`404` if gone, `409` if moved on).
- **`orderInvoiced` / `orderMissing` / `orderNotCancelled`** (internal) — Pre-built `ResponseReject` builders for the three hard-delete refusal cases.

## Relationships

- **`@infrastructure/http/response`** — All responses are shaped via `generateSuccess` / `generateReject`; `ResponseSuccess` and `ResponseReject` appear in every return type.
- **`@infrastructure/i18n`** — User-facing messages are pulled from `t('orders.…')` keys.
- **`@infrastructure/observability/audit`** — `recordAudit` is called after every successful soft delete, hard delete, and restore.
- **`../audit`** — Supplies the `ordersAuditActions.ORDER_DELETED` / `ORDER_RESTORED` action constants.
- **`../model`** — `OrderDocument` is the persisted shape read and written here.
- **`../repository`** — `orderRepository.findById`, `.save`, and `.deleteCancelledUnpaid` are the only persistence calls.
- **`./scope`** — `outrankedOrderRefusal` gates both `removeById` and `restoreById` against buyer-rank.
- **`./timeline`** — `deleteTimelineOf` removes the order's timeline rows during a successful hard delete.
- **`../services/index`** — Re-exports `remove`, `restoreById`, `removeById` as the public service API.
- **`@types`** — `OrderStatus` and `CallerContext` are consumed for status checks and audit/rank context.
- **Integration tests** (`delete-restore-audit.test.ts`, `remove-race.test.ts`, `service-crud.test.ts`) — Exercise the audit rows, the conditional-delete race, and the full CRUD cycle that includes these functions.

## Notes

- **`paidAt` takes priority over status** in `hardDeleteRefusal`: an invoiced order is refused with `ORDER_INVOICED` even if it is also `cancelled`. This mirrors the invoicing module's own rule that invoices never hard-delete.
- **Soft delete is intentionally idempotent** — calling `remove` on an already-deleted order returns success without a write, so `DELETE` is safe to retry.
- **`context` is optional** on every public function; omit it for background/system callers that have no HTTP request behind the call.
- **Hard delete is cleanup-only.** The prior cancel operation already released stock, cancelled the payment intent, and fired the webhook; this file does not repeat those side-effects.
- **On a hard-delete race** (the row changed between read and write), the function re-reads the order and returns the *current* refusal reason rather than a generic error.
