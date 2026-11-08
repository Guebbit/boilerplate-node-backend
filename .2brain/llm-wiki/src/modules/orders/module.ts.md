---
source: src/modules/orders/module.ts
sha256: a7a9f4f4217bcd35734292f2839fa52f946d6be919f71aceca3ccead7a5c0cf1
generated_at: 2026-11-08T06:53:02.363246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.ts

## Purpose

Module entry point (the `AppModule` manifest) for the **orders** module. It wires together the order module's routes, jobs, config, rate limits, event subscriptions, public webhook mappings, PII/personal-data hooks, and scenario-state list so the kernel can mount and coordinate the module. It also encodes the key invariants in its header comment: line items snapshot catalogue fields into a local schema (no live warehouse counter), inventory claims are released on cancel/expiry, and the module never imports `invoicing`.

## Key elements

- **`publicEvents`** (`Readonly<Record<string, PublicEventTarget>>`) — Maps the four internal domain events to webhook-visible payloads. Notable: `ORDER_STATUS_CHANGED` emits `order.paid` **only** when `payload.to === 'paid'`; all other status transitions produce `undefined`.
- **Default export** (`AppModule`) — The full manifest: `name`, `mounts` (router at `/orders`), `jobs`, `publicEvents`, `config`, `rateLimits`, `reencrypt`, `personalData` (two sections: `orders` and `orderTimeline`), `subscribe`, `locales`, `templates`, and `scenario.shop` (list of every order state the storefront/admin screens exercise).
- **`personalData` hooks** — `collect` reads the buyer's orders/timeline; `erase` detaches (never deletes) order rows and cancels never-paid orders post-commit; `minimise` starts the PII clock for inactive accounts.
- **`subscribe`** — Registers three `onDomainEvent` handlers: `RESERVATION_EXPIRED` → `expireReservationById`; `ORDER_CREATED` → placement mail; `ORDER_CANCELED` → cancel mail + `considerPurchaseHold` (runs in parallel, never rejects).
- **`scenario.shop`** — 20+ named states (e.g. `order.partiallyFulfilled`, `order.withdrawal-last-day`, `order.mixedImageStates`) that integration scenarios must produce by driving real endpoints.

## Relationships

- **`src/kernel/events.ts`** — Consumes `onDomainEvent` (subscription registration) and the `DomainEventMap` type for payload typing in `publicEvents`.
- **`src/kernel/registry.ts`** — Consumes `AppModule` and `PublicEventTarget` types; the kernel's `resolvePublicEvents` reads `publicEvents` generically rather than importing event constants by name.
- **`src/modules/inventory/index.ts`** — Imports the `RESERVATION_EXPIRED` event constant; the orders module subscribes to it to cancel an order when a stock hold times out.
- **`src/modules/orders/events.ts`** — Imports `ORDER_CANCELED`, `ORDER_CREATED`, `ORDER_REDACTED`, `ORDER_STATUS_CHANGED` directly (not via the module barrel) both for `publicEvents` keys and for `onDomainEvent` subscriptions.
- **`src/modules/orders/config.ts`** — Imports `ordersConfig`; its `slice` is exposed as the module's config gate.
- **`src/modules/orders/jobs.ts`** — Imports `ordersJobs` for scheduled/deferred work.
- **`src/modules/orders/rate-limits.ts`** — Imports `ordersRateLimits` applied to the module's routes.
- **Test files** (invoicing integration, delivery integration, observability unit) — Exercise this module's public events and order state transitions as part of cross-module integration flows.

## Notes

- The header comment explicitly states **no import of `invoicing`** exists in this module; `invoicing` depends on orders, not the reverse. Keep it that way.
- `publicEvents` uses computed keys (`[ORDER_CREATED]`), so the mapping is keyed by the internal event constant, not by the public event string. Webhook subscribers match on the public `eventType` string.
- `ORDER_STATUS_CHANGED` is the only public event that can resolve to `undefined` — the kernel must treat that as "no webhook emitted," not an error.
- The `personalData.erase` hook and `inventory`'s `RESERVATION_EXPIRED` path both call `releaseForOrder`; the code comment notes they converge safely (the second call finds the hold already released, so no double-release).
- Scenario state names in `scenario.shop` must stay in lock-step with what `tests/integration/scenarios/shop.test.ts` records in both directions.
