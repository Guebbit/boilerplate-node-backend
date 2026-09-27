---
source: src/modules/orders/services/crud.ts
sha256: b6186776cc3d5777254ea63939a4ba6a6247cbb2e69ce9c03a77eebd107cfe7c
generated_at: 2026-09-27T15:13:33.380969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/crud.ts

## Purpose

CRUD service layer for the Orders module: searching, fetching, creating, updating, and (partially) deleting order records. It composes lower-level operations (`placeOrder`, image resolution, email dispatch, audit/analytics emission) into the endpoints' public API. Cancellation is intentionally excluded—it lives in `./cancel` with its own multi-step sequence.

## Key elements

- **`search(search, scope?, context?)`** — Paginated order search (DTO wire shape). Batch-resolves current product images for the whole page via `resolveCurrentImages`. Emits `ORDERS_VIEWED` analytics when a `CallerContext` is supplied.
- **`ownOrderIds(userId)`** — Returns every order ID for a user (paged internally via `readAll`). Intended for sibling modules that need IDs only, avoiding image resolution and analytics.
- **`findOwnOrders(userId)`** — Full-order export path; delegates through `search` so image resolution runs, but omits `context` so no view-analytics fire.
- **`getById(id, scope?)`** — Single-order fetch returning `OrderDocument` (hydrated). Returns `undefined` on missing/falsy ID.
- **`recordCreated(order, context)`** — Audit + analytics emission for an order creation. Deliberately separated from `placeOrder` so both the admin path and cart's `orderConfirm` can call it without duplicating the write.
- **`countOpenBankTransfers(userId)`** — Open `bank_transfer` order count; checkout uses this to cap free stock holds.
- **`getByTransferReference(reference)`** — Exact-match lookup by RF reference (admin payment reconciliation).
- **`create(userId, email, items, context)`** — Admin order creation. Resolves buyer's stored locale (falls back to default on failure), resolves product snapshots, delegates the write to `placeOrder`, then calls `recordCreated` and fires the placed-order email. Returns typed `ResponseSuccess`/`ResponseReject`.
- **`update(order, data)`** — Applies an email change to a loaded document and saves. Does not touch `status` (not in `UpdateOrderByIdRequest`).
- **`updateById(id, data, context)`** — Fetch-then-delegate to `update`; returns 404 reject on miss.
- **`resolveItemProducts`** (private) — Parallel `productService.findByIdRaw` lookup for each cart line.

## Relationships

- **`./place`** (`placeOrder`) — `create` delegates the actual write, stock hold, and invoice allocation here. `placeOrder` owns its own rollback on refused writes.
- **`./cancel`** — Not imported here; the module docblock explicitly excludes cancellation from this file.
- **`./current`** (`resolveCurrentImages`) — Batch image resolution applied to search and find-own-orders results.
- **`./notify`** (`sendOrderPlacedEmail`, `mailBuyer`) — Post-creation email dispatch in `create`.
- **`./invoice`** (`deleteCachedInvoice`) — Imported (used by the broader module, referenced in this file's import list).
- **`./scope`** (`ownerScope`) — Builds the ownership filter passed to repository searches for `ownOrderIds` / `findOwnOrders`.
- **`../analytics`** / **`../audit`** — Event and action-name constants consumed by `search` and `recordCreated`.
- **`../model`** — `OrderDocument` type used throughout.
- **`../repository`** (`orderRepository`) — All persistence reads/writes go through this.
- **`@modules/inventory`** (`inventoryService`) — Imported; stock-related reads during the create flow.
- **`@modules/products`** (`productService`) — Product lookup for snapshot resolution.
- **`@modules/users`** (`userService`) — Buyer locale lookup in `create`.
- **`@infrastructure/i18n`** — `t()` for user-facing messages; `getDefaultLocale()` for fallback.
- **`@infrastructure/observability/audit`** / **`analytics`** — `recordAudit` / `emitAnalyticsEvent` calls.
- **`@infrastructure/persistence/search`** (`readAll`, `MAX_CONFIGURED_PAGE_SIZE`) — Pagination helper for `ownOrderIds` and `findOwnOrders`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` response builders.
- **`@infrastructure/adapters/logger`** — Error logging in the buyer-locale fallback path.
- **`asyncapi.public.yaml`** — The search endpoint shape (`POST /orders/search`) is documented there; this file implements it.

## Notes

- `recordCreated` is audit + analytics **only**; it does not emit the `ORDER_CREATED` webhook or perform any write. That responsibility stays in `placeOrder`, so a caller forgetting `recordCreated` cannot also silence the webhook.
- `create` resolves the buyer's locale from `userService`, **not** from `context.locale` (which may be an admin's UI language). The lookup is guarded: failure falls back to `getDefaultLocale()` rather than aborting the order.
- `update` intentionally does not handle `status`—the request type omits it, and the theory doc (`docs/theory/tactical-ddd.md#who-writes-the-status`) designates a different owner for status transitions.
- `ownOrderIds` and `findOwnOrders` both use `readAll` to transparently page through all results; the former skips image resolution, the latter does not.
- `create` uses flat `await`s (not nested `.then()`) so that `toObjectId` and other steps reject as promises rather than throwing synchronously.
- `search`'s `context` parameter is optional; passing it triggers the `ORDERS_VIEWED` analytics emit, omitting it suppresses it (e.g., in `findOwnOrders`).
