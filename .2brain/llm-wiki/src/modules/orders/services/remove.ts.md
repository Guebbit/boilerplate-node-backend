---
source: src/modules/orders/services/remove.ts
sha256: 7fafc100409c8b00166a808cfbe6036d67cc5fd58d8171e102065a9b440ceee4
generated_at: 2026-11-08T07:00:14.958186+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/remove.ts

## Purpose

Handles order deletion (soft and hard) and restoration of soft-deleted orders. Because an order is a financial record, the default path stamps `deletedAt` (soft delete) and a separate `restoreById` undoes it; hard delete is restricted to orders that are canceled and were never paid. The file centralizes the refusal logic, the write, and the audit trail so callers need only know the public door.

## Key elements

- **`remove`** *(exported, `@internal`)* — Core delete. Accepts an already-loaded `OrderDocument` plus a `hardDelete` flag. Soft path stamps `deletedAt` (idempotent if already set) and saves; hard path runs refusal checks then a conditional `deleteCanceledUnpaid`, cascading to `deleteTimelineOf` on success.
- **`removeById`** *(exported)* — Public entry point. Fetches the order by id (404 if absent) and delegates to `remove`. This is what the barrel exposes.
- **`restoreById`** *(exported)* — Clears `deletedAt` on a soft-deleted order and saves. Returns 409 `ORDER_NOT_DELETED` if the order is not in a soft-deleted state.
- **`hardDeleteRefusal`** *(internal)* — Priority-ordered guard: `paidAt` → `ORDER_INVOICED`, then `moneyReceivedAt` → `ORDER_HAS_MONEY_HISTORY`, then not-canceled → `ORDER_NOT_CANCELED`. Returns `undefined` when the order passes `hardDeletable`.
- **`hardDeleteCanceled`** *(internal)* — Executes the conditional delete. On a miss (order moved or already gone) re-reads the row to produce the correct refusal or 404.
- **Response helpers** — `orderInvoiced`, `orderHasMoneyHistory`, `orderNotDeleted`, `orderMissing`, `orderNotCanceled`: small factories returning pre-built `ResponseReject` objects with i18n'd messages.

## Relationships

- **`@infrastructure/http/response`** — All return values are shaped through `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` union types.
- **`@infrastructure/i18n`** — `t()` localizes every user-facing refusal message.
- **`@infrastructure/observability/audit`** — `recordAudit` is called after each successful delete/restore to write an audit row.
- **`src/modules/orders/audit.ts`** — Provides the `ordersAuditActions` constants (`ORDER_DELETED`, `ORDER_RESTORED`).
- **`src/modules/orders/domain/`** — `hardDeletable` and `softDeletable` predicates gate which path an order may take.
- **`src/modules/orders/model.ts`** — `OrderDocument` is the shape read from and written to the repository.
- **`src/modules/orders/repository.ts`** — `orderRepository.save`, `.findById`, and `.deleteCanceledUnpaid` are the only persistence calls.
- **`src/modules/orders/services/timeline.ts`** — `deleteTimelineOf` removes the order's timeline entries after a successful hard delete.
- **`src/modules/orders/services/index.ts`** — Barrel that re-exports `removeById` as the module's public delete API.
- **`src/types/auth-context.ts`** — `CallerContext` is forwarded into `recordAudit` for attribution.
- **`src/modules/orders/tests/integration/remove-race.test.ts`** — Exercises the read-then-write race in the hard-delete path.
- **`src/modules/orders/tests/integration/service-crud.test.ts`** — Covers soft-delete, restore, and idempotency scenarios.

## Notes

- `remove` is marked `@internal`; only `removeById` is published through the barrel. Callers outside this module should not import `remove` directly.
- Soft delete is intentionally idempotent: if `deletedAt` is already set, the function returns 200 with the existing document rather than erroring. This makes `DELETE` safe to retry.
- The hard-delete refusal checks `paidAt` directly instead of querying the invoicing module for whether a freeze landed — a paid order is kept regardless.
- On a hard-delete miss (conditional delete returns `deleted = false`), the file re-reads the order to distinguish "moved to a non-deletable state" from "row truly gone," returning the correct 409 vs. 404.
- The `context` parameter is optional in every public function, allowing background jobs or CLI scripts to call deletion without a request-scoped auth context.
