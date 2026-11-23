---
source: src/modules/shop-tasks/module.ts
source_sha256: dc1cbfe48d23a09f5489ef8df35fa94b70e4a6f3b66354b9f777a41f7aa29f88
context_sha256: 8a7ee731c7c1433fcb8462e97820b65dcc297259c185ede0226e5b1cca61cd58
generated_at: 2026-11-22T07:41:41.345137+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/module.ts

## Purpose
Manifest entry for the `shop-tasks` module, the shop's side of the helpdesk. It subscribes to domain events from other modules and, for each, opens or clears a to-do (via `tasks`), writes a buyer message or staff work notice (via `notifications`), or both. It also runs the staff digest and exposes one route, `GET /shop-tasks/summary`, which counts open work for staff navigation badges. It owns no collection of its own.

## Key elements
- **Default export** (`satisfies AppModule`): the manifest with:
  - `name: 'shop-tasks'`
  - `mounts`: the router from `./routes` at `/shop-tasks`
  - `config`: `[shopTasksConfig.slice]`
  - `jobs`: `shopTasksJobs` (the digest jobs)
  - `onRegistered`
  - `personalData: 'none'`
  - `subscribe`
  - `locales`: `./locales`
  - `templates`: `./templates`
- **`onRegistered`**: calls `registerOutcomeUnknownSink` so that, when an idempotency key's outcome is unknown, `shopTasksService.tellOutcomeUnknown(facts)` notifies staff. It is fire-and-forget (`void`), so the client's 409 never waits on it.
- **`subscribe`**: wires `onDomainEvent(event, shopTasksService.<handler>)` in two groups:
  - **To-dos** (opening events and the events that end them):
    - Refunds: owed by hand, failed, reversed, refunded/canceled (shared `onRefundClosed`), unrecorded, return refund short, owed after dispute.
    - Payments and disputes: amount mismatch, dispute opened/updated (shared `onDispute`).
    - Returns: closed by hand.
    - Inventory: hold orphaned.
    - Orders: order canceled.
    - Delivery: shipped, fulfillment order canceled, fulfillment order delayed (one handler does both the to-do and the buyer's message, in order).
  - **Notices** (buyer message or staff work notice): cart lines removed, wishlist items removed, cart merge refused, stock alert sent, fulfillment order hold noticed, shipment lost, purchase hold placed, return requested.

## Relationships
- `@kernel/registry`: supplies the `AppModule` type that the manifest satisfies. `src/modules.ts` is where modules are registered.
- `@kernel/events`: provides `onDomainEvent`, used for every subscription.
- `@infrastructure/http/middlewares/idempotency`: provides `registerOutcomeUnknownSink`.
- Event constants are imported from the `cart`, `delivery`, `inventory`, `orders`, `payments`, `returns`, `stock-alerts` and `wishlist` module indexes. These modules are listeners' sources only; none import `shop-tasks`.
- `./config`, `./jobs`, `./routes` and `./services`: provide the config slice, digest jobs, router and event handlers.
- `tasks` and `notifications` modules do the actual writing, auditing, export and erasure of rows. Their contracts are extended by this module's OpenAPI/AsyncAPI fragments.

## Notes
- No producer imports this module. Removing it just leaves the shop's events without a listener.
- The sink is installed in `onRegistered`, not at import time or in `app.ts`, so it exists only when the module is enabled (same reasoning as `audit-logs`).
- `personalData: 'none'` because `tasks` and `notifications` own the personal data.
- `tellOutcomeUnknown` never rejects (it logs its own failure), which is why the floating promise is deliberately silenced.
