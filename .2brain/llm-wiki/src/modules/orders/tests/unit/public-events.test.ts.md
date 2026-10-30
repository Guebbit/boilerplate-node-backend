---
source: src/modules/orders/tests/unit/public-events.test.ts
sha256: e4aaddf1214857cadbbc985c845774e07e24470d6e94d32f2784286df61c9283
generated_at: 2026-10-29T04:59:42.508471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/public-events.test.ts

## Purpose

Unit tests that verify the orders module's **public event projections** — the `publicEvents` entries in the module manifest that translate internal domain events into the `{ eventType, data }` payload delivered to webhook subscribers. Each test pins the exact event name and the (intentionally minimal) data shape a subscriber receives.

## Key elements

- **`describe('the orders module's public events', …)`** – top-level suite; every test reads a single entry from `ordersModule.publicEvents[…]` and calls its `toPublicEvent` method.
- **`ORDER_CREATED` test** – asserts projection → `{ eventType: 'order.created', data: { orderId } }`.
- **`ORDER_STATUS_CHANGED` test** – asserts the projection is a *filter*: `to: 'paid'` yields `{ eventType: 'order.paid', … }`; any other status (e.g. `'shipped'`) yields `undefined` (no public event).
- **`ORDER_CANCELLED` test** (`it.each([true, false])`) – asserts projection → `{ eventType: 'order.cancelled', data: { orderId } }` and explicitly that `refund` is **not** present in the subscriber payload, regardless of the internal policy flag.
- **`ORDER_REDACTED` test** – asserts projection → `{ eventType: 'order.redacted', data: { orderId } }`.

## Relationships

- **`src/modules/orders/events.ts`** – source of the four event-type constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `ORDER_REDACTED`) used as lookup keys into the `publicEvents` map.
- **`src/modules/orders/module.ts`** – default-exports `ordersModule`; the tests read `ordersModule.publicEvents` (the system under test) and call each entry's `toPublicEvent` method.

## Notes

- Every call to `toPublicEvent` passes its argument as `as never`. This is a **deliberate convention**, not a type error: the shared registry signature types the input slot as `never` so one uniform shape can hold every module's projections. Don't "fix" these casts.
- The `ORDER_CANCELLED` test is parameterised over `refund: true | false` to guard against a regression where the internal policy flag leaks into the public payload. The design intent (per the inline comment) is that refund *execution* belongs to the `payments` module; subscribers hear `payment.refunded` separately.
- The `ORDER_STATUS_CHANGED` projection is **selective** — only the `paid` transition produces a public event. Adding a new subscriber-visible status transition requires both a new projection entry and a corresponding test here.
