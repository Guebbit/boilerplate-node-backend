---
source: src/modules/orders/services/crud.ts
sha256: 60e02bda91386ab0ba364ccdd0892b760d911b6052e4210c5da827941dcb62ea
generated_at: 2026-10-15T11:07:32.824405+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/crud.ts

## Purpose

The admin-facing write path for orders: creating a new order (product snapshot, stock hold, invoice allocation) and updating an existing one (email only). It composes validation, rank checks, locale resolution, and post-write side-effects (audit, analytics, email) around `placeOrder`, which owns the actual persistence and rollback.

## Key elements

- **`create(userId, email, items, context)`** — Main admin order-creation entry point. Enforces deployment line/quantity limits, checks caller-vs-buyer rank, resolves the buyer's stored locale, batch-resolves product IDs, delegates to `placeOrder`, then fires `recordCreated` and mails the buyer.
- **`recordCreated(order, context)`** — Shared "order was created" audit + analytics emit. Extracted so both this file and `@modules/cart`'s checkout can report the same fact without one path triggering the other's email.
- **`update(order, data)`** — Applies an email change to an in-memory `OrderDocument` and persists it via `orderRepository.save`. Status is intentionally not a field here.
- **`updateById(id, data, context)`** — Fetches by ID, 404s if missing, runs `outrankedOrderRefusal`, delegates to `update`, and records an `ORDER_UPDATED` audit entry on success.
- **`lineLimitRefusal(items)`** *(private)* — Returns a 422 `ResponseReject` if line count or per-line quantity exceeds the operator-configured ceilings from `config.ts`.
- **`resolveItemProducts(items)`** *(private)* — `Promise.all` over `productService.findByIdRaw` to pair each input line with its full product document.

## Relationships

- **`./place`** — `placeOrder` performs the actual write, stock hold, and rollback; this file supplies resolved inputs and maps the `outcome` back into HTTP responses.
- **`./notify`** — `mailBuyer` / `sendOrderPlacedEmail` deliver the post-creation email; called only here (not in `recordCreated`) to avoid double-sending on the shared path.
- **`./scope`** — `outrankedOrderRefusal` gates `updateById` against a buyer who ranks ≥ the caller.
- **`../analytics`, `../audit`, `../config`, `../model`** — Provide event-name constants, audit-action constants, operator limits, and the `OrderDocument` type respectively.
- **`@infrastructure/i18n`** — `t()` for user-facing messages, `getDefaultLocale()` as fallback when the buyer lookup fails.
- **`@infrastructure/observability/analytics`, `@infrastructure/observability/audit`** — `emitAnalyticsEvent` / `recordAudit` for the post-creation and post-update side-effects.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@modules/access`** — `outrankedRefusal` blocks an operator from placing an order for an equal-or-superior user.
- **`@modules/products`** — `productService.findByIdRaw` resolves product snapshots; `canSeeStock` gates whether the stock-shortage refusal exposes the `available` quantity.
- **`@modules/users`** — `userService.getById` fetches the buyer's stored locale.
- **`@infrastructure/adapters/logger`** — Error logging when the buyer-locale lookup fails.

## Notes

- **Buyer locale, not caller locale.** The order snapshot uses the *recipient's* stored language (`userService.getById(userId).locale`), because an admin may place an order for someone else. A lookup failure falls back to `getDefaultLocale()` rather than aborting.
- **`recordCreated` is audit/analytics only.** The `ORDER_CREATED` domain event (webhook) is emitted by `placeOrder` itself; this function intentionally does not duplicate it.
- **Stock-shortage refusal is role-aware.** The `available` field in the shortfall details is included only when `canSeeStock(context.caller)` is true, preventing the refusal from widening a stock read.
- **`create` is `async` by design** so that `toObjectId` (inside `placeOrder`) rejects as a promise rejection rather than throwing synchronously, keeping the failure shape consistent.
- **`update` handles email only.** `UpdateOrderByIdRequest` does not declare `status`; status transitions are owned elsewhere (see `docs/theory/tactical-ddd.md#who-writes-the-status`).
- **`superseded` outcome from `placeOrder` is an invariant violation** in this code path (no `commitWith` step is passed), so it `throw`s rather than returning a 409.
