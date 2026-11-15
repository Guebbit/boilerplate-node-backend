---
source: src/modules/orders/tests/unit/public-events.test.ts
sha256: 98b17d9d7173500e4bd977fd785bf45f32e8e833b78b90661438d6dd896344d5
generated_at: 2026-11-14T20:57:42.687102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/public-events.test.ts

## Purpose

Verifies that the orders module's public-event projections (the `publicEvents` registry on the module manifest) emit the correct webhook `eventType` strings and payload shapes for each domain event, and that the AsyncAPI contract stays in sync with the code.

## Key elements

- **`ORDER_CREATED` projection test** — asserts the subscriber receives `{ eventType: 'order.created', data: { orderId } }`.
- **`ORDER_STATUS_CHANGED` projection test** — asserts only the `to: 'paid'` transition produces a public event (`order.paid`); any other transition produces no public event (asserted via `toBeUndefined()`).
- **`ORDER_CANCELED` projection tests** — asserts the payload includes `cause` but deliberately omits `refund` (refund policy is a `payments` concern). Covers both `refund: true` and `refund: false`, and the `'lost'` cause specifically.
- **Contract-sync test** — reads the module's AsyncAPI YAML file, parses the `OrderCanceledPayload.cause.enum`, and asserts it equals `Object.keys(CANCEL_CAUSES)`. Guards against the YAML copy drifting from the code's list.
- **`ORDER_REDACTED` projection test** — asserts the subscriber receives `{ eventType: 'order.redacted', data: { orderId } }`.

## Relationships

- **`src/modules/orders/module.ts`** — the system under test; the file imports its default export (`ordersModule`) and calls `.publicEvents[eventKey].toPublicEvent(...)` in every test.
- **`src/modules/orders/events.ts`** — supplies the domain-event constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`, `ORDER_REDACTED`) used as registry keys.
- **`src/modules/orders/services/cancel.ts`** — supplies `CANCEL_CAUSES`, the source-of-truth list compared against the AsyncAPI enum.
- **`tests/support/paths.ts`** — provides `MODULES_ROOT` so the contract-sync test can locate the YAML file on disk.
- **`tests/support/stub.ts`** — provides `asStub<never>()`, which casts a plain object to satisfy the `never`-typed input slot on the projection signature.

## Notes

- The projection input slot is typed `never` so a single registry type can hold projections for every module. `asStub<never>()` is the escape hatch; don't expect runtime type safety at the call site.
- The contract-sync test is a *file I/O* test (reads YAML from disk), not a pure unit test — it will fail if the file is missing or the schema path changes.
- `refund` is intentionally absent from the public `order.canceled` payload; subscribers learn of actual money movement via a separate `payment.refunded` event.
