---
source: src/modules/orders/services/crud.ts
sha256: 82ee7d7419de34e42f82e9f8cdaa4e769287ab48fa5d7bcec9c2c93e9ce3e1f8
generated_at: 2026-11-08T06:56:42.780345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/crud.ts

## Purpose

Admin-facing write operations for orders: **create** and **update** (email amendment). The file deliberately scopes itself to the "admin door" — creating an order composes around `placeOrder` (which owns the actual write, stock hold, and rollback), and updating delegates the raw save to `updateById`. Reads live in `./read`, deletes in `./remove`, and cancellation in `./cancel`.

## Key elements

- **`recordCreated(order, context)`** — Emits the `ORDER_CREATED` audit row and analytics event. Exported separately so both the admin `create` path and the customer checkout path (`@modules/cart` → `orderConfirm`) share one recording point, while `placeOrder` remains the sole writer of the order document and its webhook emission.
- **`create(userId, email, items, context)`** — Validates operator line-count / quantity limits, confirms the buyer exists, resolves each product id (scoped to the caller's visibility), rejects any deleted products (409), then calls `placeOrder` with no payment or shipping. Maps `placeOrder` failure reasons to specific HTTP refusals (422, 404, 409) and conditionally includes `available` stock only when the caller may read stock.
- **`update(order, data)`** — `@internal`. Mutates `order.email` in place and persists via `orderRepository.save`. `status` is intentionally absent from `UpdateOrderByIdRequest`; no status logic lives here.
- **`updateById(id, data, context)`** — Fetches the order by id, records a `auditChanges` metadata diff (email is *named*, not *valued*), calls `update`, and on success records an `ORDER_UPDATED` audit row. Returns a 404 `ResponseReject` (not a throw) when the order is missing.
- **`lineLimitRefusal(items)`** *(internal)* — Checks `maxAdminOrderLines` and `maxAdminOrderLineQuantity` from `../config`; returns a 422 `ResponseReject` or `undefined`.
- **`resolveItemProducts(items, scope)`** *(internal)* — `Promise.all` over `productService.findByIdRawScoped`, pairing each input line with its (possibly `null`) product.

## Relationships

- **`./place`** — `create` delegates the actual order write, stock hold, and freeze to `placeOrder`. The `superseded` failure reason is unreachable here (no `commitWith` step is passed) and is treated as an invariant violation.
- **`../repository`** — `updateById` calls `orderRepository.findById`; `update` calls `orderRepository.save`.
- **`../config`** — Supplies `maxAdminOrderLines()` and `maxAdminOrderLineQuantity()` for the operator-level limit check.
- **`../analytics` / `../audit`** — Provides `ordersAnalyticsEvents` and `ordersAuditActions` enums used in `recordCreated` and `updateById`.
- **`@infrastructure/observability/audit` & `audit-changes`** — `recordAudit` emits the audit row; `auditChanges` builds the metadata diff before `update` mutates the document.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for the `ORDER_CREATED` analytics event.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages; `getDefaultLocale()` for buyer-locale fallback.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@modules/products`** — `productService.findByIdRawScoped` resolves line products; `canSeeStock` gates whether `available` quantity is included in the 409 refusal.
- **`@modules/users`** — `userService.getById` confirms the buyer exists before any product lookup.
- **`services/index.ts`** — Barrel export that re-exports this module's public API.

## Notes

- **Buyer locale, not caller locale.** `create` uses `buyer.locale` (falling back to the default) for the snapshot, never `context.locale`. This is critical when an admin places an order for another user — the admin's UI language must not leak into the order record. Same rule as the cart checkout path.
- **`update` is `@internal`.** Callers should go through `updateById`, which guarantees the audit row is recorded. Calling `update` directly skips auditing.
- **404 vs. 500 distinction.** A missing buyer in `create` is a 404 refusal; a missing order in `updateById` is also a 404 refusal (returned, not thrown), so a downstream `.catch()` can tell a "not found" from a genuine database error.
- **Stock visibility in refusals.** The `available` count in the 409 insufficient-stock refusal is included only when `canSeeStock(context.caller)` is true, preventing the error response from widening the caller's product-read scope.
- **`async` + flat `await`s** in `create` (not chained `.then()`) ensures a malformed `userId` rejects the promise rather than throwing synchronously, matching the convention used in `@modules/cart`'s `runCheckout`.
