---
source: src/modules/shop-tasks/module.ts
sha256: 4872e8e5bd93dc019af12d6769601346ff774a0166d28075ad4eea3b805784d7
generated_at: 2026-11-14T21:51:03.374146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/module.ts

## Purpose

Module manifest for the **shop-tasks** module — the shop-side of the helpdesk. It subscribes to domain events emitted by cart, delivery, inventory, orders, payments, returns, stock-alerts, and wishlist modules, wiring each to a service handler that opens/closes a to-do, writes a buyer or staff notification, or both. It also mounts the single staff route (`GET /shop-tasks/summary`), registers the staff digest jobs, and installs the idempotency outcome-unknown sink. No other module imports this file; it is a pure event consumer.

## Key elements

- **`onRegistered`** (module-scoped, not exported) — calls `registerOutcomeUnknownSink` so that when the idempotency middleware returns a 409 with an unknown outcome, a fire-and-forget notice is sent to staff via `shopTasksService.tellOutcomeUnknown`. Registered on module init (not at import time) so it only fires when the module is actually enabled.
- **Default export** (typed `AppModule`) — the manifest the kernel consumes:
  - `name`: `'shop-tasks'`
  - `mounts`: mounts the local `router` at `/shop-tasks`
  - `config`: the `shopTasksConfig` slice
  - `jobs`: `shopTasksJobs` (staff digest)
  - `onRegistered`: the sink installer above
  - `personalData`: `'none'` (writes go through `tasks`/`notifications` which own their own rows)
  - `subscribe()`: registers ~21 `onDomainEvent` handlers (see Relationships)
  - `locales` / `templates`: filesystem paths for i18n strings and the digest template

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Provides the `AppModule` type the default export satisfies. |
| `src/kernel/events.ts` | Provides `onDomainEvent`, the subscription primitive used throughout `subscribe()`. |
| `src/infrastructure/http/middlewares/idempotency.ts` | Provides `registerOutcomeUnknownSink`, called from `onRegistered`. |
| `src/modules/payments/index.ts` | Source of 9 event constants (refund, dispute, mismatch) that drive to-do open/close. |
| `src/modules/delivery/index.ts` | Source of 5 event constants (shipped, lost, delayed, hold, fulfillment-canceled). |
| `src/modules/orders/index.ts` | Source of `ORDER_CANCELED`, `ORDER_PURCHASE_HOLD_PLACED`. |
| `src/modules/cart/index.ts` | Source of `CART_LINES_REMOVED`, `CART_MERGE_REFUSED`. |
| `src/modules/inventory/index.ts` | Source of `HOLD_ORPHANED`. |
| `src/modules/returns/index.ts` | Source of `RETURN_REQUESTED`. |
| `src/modules/shop-tasks/config.ts` | Provides `shopTasksConfig` used in the manifest. |
| `src/modules/shop-tasks/jobs.ts` | Provides `shopTasksJobs` (staff digest scheduler). |
| `src/modules/shop-tasks/asyncapi.notifications.yaml` | Contract fragment defining the notification payloads this module causes to be written. |
| `src/modules/shop-tasks/openapi.notifications.yaml` | Contract fragment (same role, OpenAPI surface). |
| `src/modules.ts` | Aggregates this module's default export into the app's module list. |

## Notes

- **Pure consumer, no producer.** Removing this file leaves every upstream event still emitted but simply unlistened-to; no compile-time or runtime error in other modules.
- **`onRegistered` timing.** The idempotency sink is deliberately *not* registered at import time or in `app.ts`; it hooks in only when the kernel confirms the module is enabled, matching the pattern used by `audit-logs`.
- **Personal data.** Declared `'none'` because all writes flow through the `tasks` and `notifications` modules, which own row lifecycle and erasure. This module never persists buyer data directly.
- **Contract growth.** The module's YAML fragments (`openapi.tasks.yaml`, `openapi.notifications.yaml`, `asyncapi.notifications.yaml`) extend the public API surface of `tasks` and `notifications` without those modules importing shop-tasks.
