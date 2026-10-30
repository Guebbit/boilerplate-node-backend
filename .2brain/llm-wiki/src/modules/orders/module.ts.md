---
source: src/modules/orders/module.ts
sha256: 6219ba95a8ff9e047462c5d64447e7f2cdc3323e41755a363424013ea15087fb
generated_at: 2026-10-29T04:43:18.316739+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.ts

## Purpose

The module manifest (default export) for the `orders` module. It wires the module into the kernel: mounts HTTP routes, declares public webhook events, registers background jobs, rate limits, config gates, PII hooks, and domain-event subscriptions. It exists so the kernel's registry can discover everything the orders module contributes without the module having to self-register elsewhere.

## Key elements

- **`publicEvents`** — Maps internal domain-event names to webhook-visible payloads. Notably, `ORDER_STATUS_CHANGED` is filtered: only the transition *to* `'paid'` emits a public `order.paid` event; all other transitions return `undefined` and are suppressed.
- **Default export (`AppModule`)** — The single object the kernel consumes. Key fields:
  - `mounts` — Mounts `./routes` at `/orders`.
  - `jobs` / `rateLimits` / `config` — Re-exported from `./jobs`, `./rate-limits`, `./config`.
  - `reencrypt` — `orderService.reencryptOrders`; re-encrypts PII (frozen addresses, notes) on key rotation.
  - `personalData` — Two GDPR sections: `orders` (collect, erase-detach, minimise-PII-clock) and `orderTimeline` (collect only; erased as part of the orders' own detach). Erase is a detach (null the buyer reference), never a hard delete.
  - `subscribe` — Registers three `onDomainEvent` handlers:
    - `RESERVATION_EXPIRED` → `orderService.expireReservationById` (shop-initiated cancel of a timed-out hold).
    - `ORDER_CREATED` → `orderService.mailOrderPlaced`.
    - `ORDER_CANCELLED` → fires cancel mail and purchase-hold check concurrently; neither can block the other.
  - `locales` / `templates` — Filesystem paths for i18n and email templates.
  - `scenario.shop` — Ordered list of order states that `scenarios/flows/shop-history.ts` must reach and `tests/integration/scenarios/shop.test.ts` asserts in both directions.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` and `PublicEventTarget` types this file imports; at runtime, the registry's `resolvePublicEvents` iterates over the `publicEvents` record here.
- **`src/kernel/events.ts`** — Source of `onDomainEvent` and the `DomainEventMap` type used to type event payloads throughout this file.
- **`src/modules/inventory/index.ts`** — Exports `RESERVATION_EXPIRED`, which this file subscribes to. This is the only cross-module import: inventory cannot cancel an order without importing orders, so the event decouples the two.
- **`src/modules/orders/events.ts`** — Declares `ORDER_CANCELLED`, `ORDER_CREATED`, `ORDER_REDACTED`, `ORDER_STATUS_CHANGED` (and registers them into the kernel's `DomainEventMap`). Imported directly, not through a barrel.
- **`src/modules/orders/config.ts`**, **`./rate-limits.ts`**, **`./jobs.ts`** — Provide the `ordersConfig`, `ordersRateLimits`, and `ordersJobs` values re-exported in the manifest.
- **`src/modules.ts`** — Top-level loader that aggregates this module's default export alongside other modules.
- **Invoicing integration tests** (`issue-invoice`, `issue-credit-note`, `credit-note-catch-up`, `reencrypt`, `retention`) — Exercise the order read path and `ORDER_STATUS_CHANGED` event that invoicing reacts to; they do not import this file but depend on its runtime behavior.
- **`src/modules/observability/tests/unit/metrics-overview-shop.test.ts`** — Reads order metrics produced by this module's jobs/routes.

## Notes

- The `publicEvents` mapping is consumed generically by `webhooks/services/publish.ts` via the kernel registry; no webhook consumer imports `ORDER_CREATED` etc. by name.
- `ORDER_STATUS_CHANGED` → public `order.paid` is a **derived** event (filtered on `payload.to === 'paid'`), not a 1:1 rename. Any other transition produces no public event.
- The `RESERVATION_EXPIRED` handler acts as `SYSTEM_ACTOR` (shop-side cancel), and converges safely with the already-released inventory hold — neither path can double-release.
- `personalData.erase` is a **detach** (set buyer reference to null), not a delete. A never-paid order is additionally cancelled *after* the commit.
- The `scenario.shop` list is a contract: `shop-history.ts` must produce each state via real endpoint calls, and the integration test asserts the list matches the recorded scenario in both directions.
