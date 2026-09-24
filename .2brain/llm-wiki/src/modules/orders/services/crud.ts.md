---
source: src/modules/orders/services/crud.ts
sha256: 1e510ce2a827c405641142b7d66d93fe59bf289a875289f83f38c94c9df57cda
generated_at: 2026-09-23T19:06:37.984247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/crud.ts

## Purpose

Service-layer CRUD operations for the Orders module: search, fetch, create, and update. It composes repository reads/writes with domain-transition guards, cross-module lookups (product, user, inventory), and the side-effect fan-out (audit, analytics, email) that each successful mutation requires. Cancellation and retraction are deliberately excluded — they live in `./cancel` and `./retract` respectively.

## Key elements

- **`search(search?, scope?, context?)`** — Paginated order search (matches `POST /orders/search`). Batch-resolves current product images via `resolveCurrentImages`, optionally emits an `orders_viewed` analytics event when a `CallerContext` is supplied.
- **`ownOrderIds(userId)`** — Returns every order id for a user by paging internally with `readAll`. Used by sibling modules that need ids only.
- **`getById(id, scope?)`** — Single-order fetch. Overloaded: without a scope it resolves `OrderDocument | undefined`; with a scope it may resolve the wire-shaped `Order`.
- **`recordCreated(order, context)`** — Shared post-creation side-effect: writes an `ORDER_CREATED` audit record and emits the corresponding analytics event. Does **not** emit the `ORDER_CREATED` domain event (that belongs to `placeOrder` in `./place`).
- **`countOpenBankTransfers(userId)`** — Returns the count of open `bank_transfer` orders for a user; used by checkout to enforce a per-account cap.
- **`getByTransferReference(reference)`** — Exact-match lookup of an order by its RF reference (admin payments lookup). Normalization is the caller's responsibility.
- **`create(userId, email, items, context)`** — Admin/bulk order creation. Resolves each product via `productService`, delegates the write + stock hold to `placeOrder`, then fires `recordCreated` and `sendOrderPlacedEmail`. Returns `ResponseSuccess` / `ResponseReject` with structured 422 / 404 / 409 error bodies.
- **`update(order, data)`** — Admin field/status update. Validates the status transition with `canTransition`; explicitly rejects `cancelled` (must go through the cancel endpoint) and blocks `shipped`/`delivered` (delivery module's responsibility). _(File is truncated here; remaining logic not visible.)_

## Relationships

| Neighbor                                                                   | Interaction                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/infrastructure/http/response.ts`                                      | All public functions return `ResponseSuccess<T>` / `ResponseReject` built via `generateSuccess` / `generateReject`.                        |
| `src/infrastructure/i18n/index.ts` (re-exports `catalog.ts`, `context.ts`) | `t()` for user-facing error/success strings; `getDefaultLocale()` as fallback when the buyer has no stored locale.                         |
| `src/infrastructure/observability/analytics/index.ts`                      | `emitAnalyticsEvent` + `buildAnalyticsBase` for `orders_viewed` and `order_created` events.                                                |
| `src/infrastructure/observability/audit.ts`                                | `recordAudit` in `recordCreated`.                                                                                                          |
| `src/infrastructure/persistence/search.ts`                                 | `readAll` + `MAX_CONFIGURED_PAGE_SIZE` for the internal pagination in `ownOrderIds`.                                                       |
| `src/infrastructure/persistence/create-repository.ts`                      | `toObjectId` for coercing `userId` before writes; rejection on malformed ids.                                                              |
| `src/modules/inventory/service.ts` (via `src/modules/inventory/index.ts`)  | `inventoryService` imported; likely consumed in the truncated portion of `update` (stock release on status change).                        |
| `src/modules/orders/analytics.ts`                                          | `ordersAnalyticsEvents` enum (e.g. `ORDERS_VIEWED`, `ORDER_CREATED`).                                                                      |
| `src/modules/orders/audit.ts`                                              | `ordersAuditActions` enum (e.g. `ORDER_CREATED`).                                                                                          |
| `src/kernel/events.ts`                                                     | `emitDomainEvent` imported; likely used in the truncated portion of `update` for `ORDER_STATUS_CHANGED`.                                   |
| `asyncapi.public.yaml`                                                     | `search` is documented as matching the `POST /orders/search` operation; response shape and error codes should stay in sync with this spec. |

## Notes

- **Locale resolution is buyer-anchored, not caller-anchored.** `create` loads the buyer's stored locale (falling back to `getDefaultLocale()`) and uses it for both the frozen line snapshots and the placed-order email. `context.locale` is the _caller's_ UI language and must not leak into buyer-facing output.
- **`create` is `async` (not `.then`-chained) so that `toObjectId` rejection propagates as a rejected promise** rather than a synchronous throw — the same contract the repository layer enforces.
- **`recordCreated` is shared with `@modules/cart`'s checkout path.** The cart path sends its own placed-order email; `create` here does too. Do not add another email call inside `recordCreated` or both paths will double-send.
- **Status-transition guard is two-layered:** the Zod schema (controller) validates the _value_; `canTransition` (this file) validates the _edge_. `cancelled`, `shipped`, and `delivered` are explicitly refused here even if the domain graph technically allows the edge, because each has a dedicated endpoint that runs additional side-effects (refunds, delivery hand-off).
- **`getById` is overloaded** so that unscoped callers get `Promise<OrderDocument | undefined>` (narrower type) while scoped callers get the wider `OrderDocument | Order | undefined`. Callers that never pass a scope avoid handling a union member they can't receive.
