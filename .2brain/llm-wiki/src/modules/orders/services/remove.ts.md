---
source: src/modules/orders/services/remove.ts
sha256: 515699f544fbc650b57e7adbc9d7f41b98670c6a0aff03f2717a47ac86e51cad
generated_at: 2026-10-29T04:49:22.184263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/remove.ts

## Purpose
Handles order deletion and restoration. Because an order is a financial record, the default is a soft delete (stamp `deletedAt`); a hard delete is permitted only when the order is `cancelled` and has never been paid. A restore operation undoes a soft delete. All paths audit the action.

## Key elements
- **`removeById`** *(exported)* — Public entry point. Fetches the order by id (404 if absent) and delegates to `remove`.
- **`remove`** *(exported, `@internal`)* — Core logic. Branches on `hardDelete`: soft path checks `softDeletable`, stamps `deletedAt`, saves; hard path runs `hardDeleteRefusal` then `hardDeleteCancelled`. Returns typed `ResponseSuccess` / `ResponseReject`.
- **`restoreById`** *(exported)* — Clears `deletedAt` on a soft-deleted order. 404 if missing, 409 `ORDER_NOT_DELETED` if not currently soft-deleted.
- **`hardDeleteRefusal`** — Pure predicate ordering refusal reasons: `paidAt` → `ORDER_INVOICED`; `moneyReceivedAt` → `ORDER_HAS_MONEY_HISTORY`; otherwise `ORDER_NOT_CANCELLED`. Returns `undefined` when `hardDeletable` is true.
- **`hardDeleteCancelled`** — Executes `orderRepository.deleteCancelledUnpaid`. On success, also calls `deleteTimelineOf`. On miss, re-reads the row to produce the correct 409 or 404.
- **Response helpers** (`orderInvoiced`, `orderHasMoneyHistory`, `orderNotDeleted`, `orderMissing`, `orderNotCancelled`) — Build standardised 409/404 `ResponseReject` objects with i18n messages and error codes.

## Relationships
- **`../domain` (via `domain/deletion.ts` → `domain/index.ts`)** — Imports `hardDeletable` and `softDeletable` predicates that gate both delete paths.
- **`../repository`** — Calls `findById`, `save`, and the conditional `deleteCancelledUnpaid` for all reads/writes.
- **`./timeline`** — Calls `deleteTimelineOf` after a successful hard delete to remove the order's timeline entries.
- **`../audit`** — Imports `ordersAuditActions` enum (`ORDER_DELETED`, `ORDER_RESTORED`) used in audit records.
- **`@infrastructure/observability/audit`** — Calls `recordAudit` on every successful delete/restore.
- **`@infrastructure/http/response`** — All return values are built via `generateSuccess` / `generateReject` with `ResponseSuccess` / `ResponseReject` types.
- **`@infrastructure/i18n`** — `t()` provides user-facing error messages.
- **`@types`** — Imports `CallerContext` for the optional audit context parameter.
- **`tests/integration/remove-race.test.ts`** — Integration tests covering race conditions on the hard-delete conditional path.
- **`tests/integration/service-crud.test.ts`** — Broader CRUD integration tests exercising `removeById` / `restoreById`.

## Notes
- **Idempotent soft delete:** if `deletedAt` is already set, `remove` returns the order with 200 immediately — safe to retry.
- **Refusal priority is fixed:** paid > money-received > not-cancelled. The code does *not* consult the invoicing service; `paidAt` alone is treated as sufficient to keep the row.
- **Hard delete is conditional at the DB level:** `deleteCancelledUnpaid` is a single atomic operation. If it returns `false` (row moved or vanished), the function re-reads to produce an accurate 409/404 rather than blindly deleting.
- **`remove` is `@internal`** — the barrel (`services/index.ts`) exposes only `removeById` and `restoreById`, matching the "one door per module" convention.
- **Hard delete also removes the timeline**; soft delete does not touch it.
