---
source: src/modules/orders/services/crud.ts
sha256: 82ee7d7419de34e42f82e9f8cdaa4e769287ab48fa5d7bcec9c2c93e9ce3e1f8
generated_at: 2026-10-29T04:46:19.102085+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/crud.ts

## Purpose

Admin-side order write path: creates a new order on behalf of a buyer (by resolving products and delegating the actual write to `placeOrder`) and updates an existing order's email. Read and delete operations live in sibling modules (`./read`, `./remove`); cancellation is handled by `./cancel`.

## Key elements

- **`create(userId, email, items, context)`** — Main entry point. Validates line-count/quantity against operator limits, confirms the buyer exists, resolves each product (scoped to the caller's read permissions), refuses if any product is deleted, then delegates to `placeOrder` for the atomic write (stock hold, snapshot, invoice allocation). Maps each `placeOrder` failure reason to the appropriate HTTP status/error-code. On success, calls `recordCreated` and returns `201`.
- **`recordCreated(order, context)`** — Emits the `ORDER_CREATED` audit row and analytics event. Intentionally separated from `placeOrder` so that webhooks (fired inside `placeOrder`) remain independent of observability side-effects.
- **`updateById(id, data, context)`** — The "door" for admin order edits. Loads the order, captures an `auditChanges` diff (email is recorded by name only, not value), delegates to `update`, then records the `ORDER_UPDATED` audit row.
- **`update(order, data)`** — Marked `@internal`. Applies the `email` field (the only updatable field in `UpdateOrderByIdRequest`) and persists via `orderRepository.save`. Status changes are explicitly out of scope.
- **`lineLimitRefusal(items)`** — Internal helper; returns a `422` reject if line count or per-line quantity exceeds the operator-configured ceilings from `../config`, or `undefined` if within limits.
- **`resolveItemProducts(items, scope)`** — Internal helper; resolves each `productId` in parallel via `productService.findByIdRawScoped`, returning `{ item, product | null }` pairs.

## Relationships

- **`./place` (`placeOrder`)** — The single function that performs the actual order write (stock hold, snapshot freeze, invoice allocation). `create` composes around it and handles its typed failure union; `recordCreated` exists separately so webhook emission inside `placeOrder` is not coupled to audit/analytics.
- **`../repository` (`orderRepository`)** — `updateById` loads the document via `findById`; `update` persists via `save`.
- **`../model` (`OrderDocument`)** — The document shape all functions read/write.
- **`../config`** — Supplies `maxAdminOrderLines()` and `maxAdminOrderLineQuantity()` for the operator-level line limits.
- **`../analytics` / `../audit`** — Provide the event-name and action-name constants (`ordersAnalyticsEvents`, `ordersAuditActions`) used in audit and analytics emission.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** — `t()` for user-facing messages; `getDefaultLocale()` for buyer-locale fallback.
- **`@infrastructure/observability/*`** — `recordAudit`, `auditChanges`, `emitAnalyticsEvent`, `buildAnalyticsBase` for the observability side-effects.
- **`@modules/products`** — `productService.findByIdRawScoped` for product lookup; `canSeeStock` gates whether stock levels appear in error details.
- **`@modules/users`** — `userService.getById` to verify the buyer exists before any write.
- **`src/modules/orders/services/index.ts`** — Barrel file that re-exports the public API of this module.

## Notes

- **Buyer locale, not caller locale.** The order snapshot uses `buyer.locale`, never `context.locale`. An admin placing an order for another user must not leak their own UI language into the recipient's record.
- **`update` is exported but `@internal`.** Sibling code should go through `updateById` so the audit-changes row is always recorded. Calling `update` directly skips the diff capture.
- **`superseded` from `placeOrder` is treated as a programming error.** This endpoint passes no `commitWith` step, so a lost write-race is impossible; hitting it throws rather than returning a 409.
- **Two distinct limit layers.** Schema-level ceilings (in the API contract / `asyncapi.public.yaml`) are enforced by validation before this code runs. `lineLimitRefusal` enforces the *operator's* deployment-specific caps from `../config`.
- **Stock in error payloads is visibility-gated.** The `available` field is stripped from `ORDER_INSUFFICIENT_STOCK` details unless `canSeeStock(context.caller)` is true, preventing a refusal from leaking inventory data to callers who shouldn't see it.
