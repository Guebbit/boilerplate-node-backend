---
source: src/modules/orders/services/remove.ts
sha256: f2254bf7a127e81c078e0aaded0bd461ea361f0405fe6e5311e1aa6e04df4c23
generated_at: 2026-11-14T20:46:13.482690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/remove.ts

## Purpose

Implements order deletion (soft and hard) and soft-delete restoration. Because an order is a financial record, the default path is a soft delete that stamps `deletedAt`; a hard delete is restricted to orders that were canceled and never paid. The file also exposes the id-based public entry point (`removeById`) that loads the document before delegating to the core `remove` logic.

## Key elements

- **`remove(order, hardDelete?, context?)`** — Core delete. Soft path: idempotent (already-deleted orders return 200), requires the order to be `canceled`, stamps `deletedAt`, saves, audits. Hard path: checks refusal reasons, performs a conditional delete, cascades timeline removal, audits. Marked `@internal`.
- **`removeById(id, hardDelete?, context?)`** — Public entry point. Fetches the order by ID (404 if missing) then delegates to `remove`.
- **`restoreById(id, context?)`** — Undoes a soft delete by clearing `deletedAt`. Returns 404 if the order is absent, 409 `ORDER_NOT_DELETED` if it was never soft-deleted.
- **`hardDeleteRefusal(order)`** *(private)* — Returns a 409 response explaining why a hard delete is refused, in priority order: `ORDER_INVOICED` → `ORDER_HAS_MONEY_HISTORY` → `ORDER_NOT_CANCELED`. Returns `undefined` when the delete is permitted.
- **`hardDeleteCanceled(order)`** *(private)* — Executes the conditional repository delete; on a race miss re-reads the order to produce a precise refusal or 404.
- **`orderMissing()` / `orderNotCanceled()`** *(private)* — Reusable 404 / 409 response builders.

## Relationships

- **`src/modules/orders/repository.ts`** (`orderRepository`) — All reads (`findById`) and writes (`save`, `deleteCanceledUnpaid`) go through the module's repository.
- **`src/modules/orders/domain/index.ts`** (`hardDeletable`, `softDeletable`) — Domain predicates that gate which orders are eligible for each delete path.
- **`src/modules/orders/services/timeline.ts`** (`deleteTimelineOf`) — Hard delete cascades: the order's timeline is removed once the row is gone.
- **`src/modules/orders/audit.ts`** (`ordersAuditActions`) — Supplies the `ORDER_DELETED` / `ORDER_RESTORED` action identifiers.
- **`src/infrastructure/observability/audit.ts`** (`recordAudit`) — Writes the audit row on every successful mutation.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`src/infrastructure/i18n/index.ts`** (`t`) — Localized user-facing messages.
- **`src/types/index.ts`** (`CallerContext`) — Optional caller identity forwarded to audit; omit when no request context exists.
- **`src/modules/orders/services/index.ts`** (barrel) — Republishes `removeById` and `restoreById` as the module's public delete surface.
- **`src/modules/orders/tests/integration/remove-race.test.ts`**, **`src/modules/orders/tests/integration/service-crud.test.ts`** — Integration tests covering the conditional-delete race and the CRUD contract.

## Notes

- **Soft delete is idempotent**: calling `remove` on an already-deleted order returns `200` with the existing document, making `DELETE` safe to retry.
- **Hard-delete refusal priority is fixed**: invoiced → money-history → not-canceled. An order that is *both* invoiced and open always answers with `ORDER_INVOICED`.
- **`remove` is `@internal`**; the barrel exposes only `removeById` (and `restoreById`). External callers should not pass a pre-loaded `OrderDocument` directly.
- **The hard delete performs no side-effects of its own** (stock release, payment-intent cancel, webhooks). Those are the responsibility of the cancel operation; hard delete is pure row + timeline cleanup.
- **`paidAt` is checked before `moneyReceivedAt`**, even though both block hard delete, because an invoice must survive regardless of whether late money was also recorded.
