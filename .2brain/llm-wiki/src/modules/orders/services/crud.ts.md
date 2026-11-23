---
source: src/modules/orders/services/crud.ts
source_sha256: b64bfb50060c1fc8484188d0b48260001017a4a45dd27cb4147e95e144d0150e
context_sha256: 93d494ea4f91ea98559256a9e3235eb5a9911e9b36a21a7a6ea30c6e2b56958a
generated_at: 2026-11-22T06:19:39.766144+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/crud.ts

## Purpose
Admin-side write operations for orders: creating an order and amending it (email only). `create` validates input, resolves the buyer and products, and delegates the actual write to `placeOrder`. It then records audit and analytics. Reads, deletes and cancellation live in sibling files (`./read`, `./remove`, `./cancel`).

## Key elements
- `create(userId, email, items, context)`: async. Steps:
  - Rejects with 422 if the items exceed the operator's line limits.
  - Looks up the buyer, with 404 if `userId` is given but not found. No `userId` means a walk-in order.
  - Takes the locale from the buyer's stored language, falling back to `getDefaultLocale()`, not the caller's locale.
  - Resolves each product through `productService.findByIdRawScoped`, scoped by `callerScope`.
  - Rejects with 409 (`ORDER_PRODUCT_UNAVAILABLE`) if any product has `deletedAt`.
  - Calls `placeOrder` and maps its failure reasons to rejects: `no-lines` → 422, `product-missing` → 404, otherwise 409 `ORDER_INSUFFICIENT_STOCK`.
  - On success, calls `recordCreated` and returns a 201.
- `recordCreated(order, context)`: exported. Emits the `ORDER_CREATED` audit record and analytics event only. It is shared with the customer checkout path (`@modules/cart`'s `orderConfirm`).
- `update(order, data)`: raw write that sets `email` if provided and saves through `orderRepository`. Marked `@internal`.
- `updateById(id, data, context)`: loads the order (404 if missing), computes `auditChanges`, calls `update`, and on success records `ORDER_UPDATED` in the audit.
- `lineLimitRefusal` (private): checks the item count and per-line quantity against `maxAdminOrderLines()` and `maxAdminOrderLineQuantity()`. Both limits reject with 422 `ORDER_LINE_LIMIT_EXCEEDED`.
- `resolveItemProducts` (private): `Promise.all` over the items, pairing each with its scoped product lookup.

## Relationships
- `./place` (`placeOrder`): performs the real order write, invoice allocation, stock hold and the webhook-facing `ORDER_CREATED` event, with its own rollback.
- `../repository` (`orderRepository`): `save` and `findById`.
- `../model`: `OrderDocument` type.
- `../config`: the operator's line limits.
- `../audit` and `../analytics`: action and event name constants.
- `@infrastructure/observability/audit` (`recordAudit`), `audit-changes` (`auditChanges`) and `analytics` (`emitAnalyticsEvent`, `buildAnalyticsBase`): observability emits.
- `@infrastructure/http/response`: `generateSuccess` and `generateReject`, plus the response types.
- `@infrastructure/i18n`: `t` for messages and `getDefaultLocale`.

## Notes
- `create` does not emit `ORDER_CREATED` to other listeners. `placeOrder` does that, and `recordCreated` covers audit and analytics only.
- Stock shortfall details include `available` only when `canSeeStock(context.caller)` is true, so a refusal does not widen the caller's read.
- Staff may sell hidden or off-sale products. Only removed (`deletedAt`) products are refused.
- `create` is `async` so that a malformed `userId` surfaces as a rejected promise rather than a throw.
- A `superseded` outcome from `placeOrder` throws an error, because this path passes no `commitWith` step and so cannot lose that race.
- `updateById` returns a 404 reject instead of throwing, so a miss is not confused with a database error. The email is audited by name only, not value, because it is personal data.
- `update` cannot change `status`, because `UpdateOrderByIdRequest` does not declare it.
- Siblings that edit an order should go through `updateById` so the audit row is not skipped.
