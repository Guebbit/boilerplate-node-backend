---
source: src/modules/orders/tests/unit/public-events.test.ts
sha256: 1c37aabf5d8fade7c234b4fd66c09db84dae9618073909a56464c3a13815d24f
generated_at: 2026-11-08T07:13:20.232440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/public-events.test.ts

## Purpose

Unit tests that verify the orders module's `publicEvents` registry: for each domain event, they assert exactly what a webhook subscriber receives (event name + payload shape) when the module's manifest projects a domain event outward.

## Key elements

- **`describe('the orders module's public events')`** — the single top-level block; every test pulls a projection function via `ordersModule.publicEvents[<DOMAIN_EVENT>]` and calls `.toPublicEvent(...)`.
- **ORDER_CREATED test** — expects `{ eventType: 'order.created', data: { orderId } }`.
- **ORDER_STATUS_CHANGED test** — projects `order.paid` only when `to === 'paid'`; returns `undefined` for any other target status (e.g. `'shipped'`).
- **ORDER_CANCELED tests (×2 + cause variant)** — projects `order.canceled` with `orderId` and `cause`; explicitly asserts the `refund` field is **not** present in the public payload (regardless of `true`/`false`). A separate case names `'lost'` as the cause.
- **AsyncAPI enum sync test** — reads `orders/asyncapi.webhooks.yaml` from disk, parses it, and asserts the `cause` enum in `OrderCanceledPayload` is deep-equal to `Object.keys(CANCEL_CAUSES)`.
- **ORDER_REDACTED test** — expects `{ eventType: 'order.redacted', data: { orderId } }`.

## Relationships

- **`src/modules/orders/module.ts`** — imports `ordersModule` to access the `publicEvents` registry under test.
- **`src/modules/orders/events.ts`** — imports the domain-event symbols (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`, `ORDER_REDACTED`) used as keys into that registry.
- **`src/modules/orders/services/cancel.ts`** — imports `CANCEL_CAUSES` as the single source of truth for the cause enum cross-checked against the AsyncAPI YAML.
- **`tests/support/paths.ts`** — imports `MODULES_ROOT` to resolve the path to `asyncapi.webhooks.yaml`.

## Notes

- Every call to `.toPublicEvent(...)` casts its argument `as never`. This is intentional: the registry slot type is `never` so a single generic registry can hold projections from every module without widening.
- The `refund` field is deliberately absent from the public payload; the comment clarifies that refund *policy* is the payments module's concern, and subscribers hear `payment.refunded` separately when money actually moves.
- The AsyncAPI enum test is the only test that reads a file from disk (`asyncapi.webhooks.yaml`). It guards against the YAML enum drifting from the code constant without any shared import being possible (YAML can't import TS).
