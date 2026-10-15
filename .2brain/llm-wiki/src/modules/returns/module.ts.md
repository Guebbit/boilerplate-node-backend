---
source: src/modules/returns/module.ts
sha256: d4014a079670bd2af734847077c68202220ad6196e31928ed425b7d1d58bf38f
generated_at: 2026-10-15T11:54:16.396157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/module.ts

## Purpose
Module manifest for the **returns** feature (customer-initiated goods returns and EU withdrawal/cancel). Wires together the module's routes, config, rate limits, public-event projections, cross-module event subscriptions, personal-data hooks, and a test scenario into a single `AppModule` object consumed by the kernel registry.

## Key elements
- **`publicEvents`** – Maps the three internal domain events (`RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED`) to their public webhook payloads (`return.requested`, `return.received`, `return.closed`). Projected by `webhooks` via the registry, never imported by name.
- **`default export` (satisfies `AppModule`)** – The manifest: `name`, `basePath`, `routes`, `config`, `rateLimits`, `publicEvents`, `subscribe`, `personalData`, `locales`, `templates`, `scenario`.
- **`subscribe()`** – Registers two cross-module listeners:
  - `PAYMENT_REFUNDED` → calls `closeReturn(returnId)` when the refund carries a `returnId` (handles both the fast path and a delayed payment-sweep completion).
  - `FULFILLMENT_ORDER_WAIT_EXPIRED` → calls `cancelUnanswered(orderId, fulfillmentOrderId)` for preorders the customer never confirmed.
- **`personalData`** – Exposes a `collect` hook (delegates to `collectPersonalData`) but deliberately omits an `erase` hook because returns are keyed by `orderId`, not `userId`.
- **`scenario`** – Declares two shop-level test fixtures (`return.requested`, `return.requestedSecond`) representing two concurrent defective-goods return requests on separate same-day orders.

## Relationships
| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Supplies the `AppModule` and `PublicEventTarget` types this manifest satisfies. |
| `src/kernel/events.ts` | Provides `onDomainEvent` (used in `subscribe`) and the `DomainEventMap` type for payload typing. |
| `src/modules.ts` | The module loader that imports and registers this manifest. |
| `src/modules/payments/index.ts` | Source of the `PAYMENT_REFUNDED` event constant consumed in `subscribe`. |
| `src/modules/delivery/index.ts` | Source of the `FULFILLMENT_ORDER_WAIT_EXPIRED` event constant consumed in `subscribe`. |
| `src/modules/returns/events.ts` | Imports `RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED` directly (not via barrel). |
| `src/modules/returns/routes.ts` | Imports the Hono/Express `router` mounted at `/returns`. |
| `src/modules/returns/config.ts` | Imports `returnsConfig` for the manifest's config slice. |
| `src/modules/returns/rate-limits.ts` | Imports `returnsRateLimits`. |
| `src/modules/returns/services/close.ts` | Imports `closeReturn`, invoked by the `PAYMENT_REFUNDED` listener. |
| `src/modules/returns/services/cancel-remainder.ts` | Imports `cancelUnanswered`, invoked by the `FULFILLMENT_ORDER_WAIT_EXPIRED` listener. |
| `src/modules/returns/services/personal-data.ts` | Imports `collectPersonalData` for the GDPR collect hook. |
| `src/modules/returns/tests/integration/*.test.ts` | Integration tests exercise the `scenario` fixtures and the event subscription paths defined here. |

## Notes
- **Barrel rule (CLAUDE.md):** `./events` is imported *directly* by path, never through the module's own barrel, to avoid a circular import when the barrel re-exports `module.ts`.
- **No `erase` hook:** Returns are keyed by `orderId`; account erasure flows through the `orders` module, not here. See `services/personal-data.ts` docblock for rationale.
- **Idempotent close:** `closeReturn` is described as a "conditional move" — safe whether the refund event or the receive-goods request reaches the close path first.
- **Dependency direction is one-way:** `orders` knows nothing of this module; the dependency arrow only points *into* `returns`.
