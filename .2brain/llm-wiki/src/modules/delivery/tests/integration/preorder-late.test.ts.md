---
source: src/modules/delivery/tests/integration/preorder-late.test.ts
sha256: 0380f71d3c7ccf9eac97539de7c640bfb61531aca30bdd65a8a04ef4a593cd3d
generated_at: 2026-10-14T15:37:20.383775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/preorder-late.test.ts

## Purpose

Integration test for the "release date slips" scenario (PRODUCT_STATES P5) on a paid preorder. It exercises the full lifecycle through real infrastructure: an admin moves the product's release date, the delivery module decides whether to merely notify or ask the buyer to confirm, the buyer answers, and the daily sweep handles a date that has already passed. Real Mongo and real outbox are used; only the mailer is mocked at the queue boundary.

## Key elements

- **`preorder(days, quantity)`** – Creates a paid preorder order and its fulfillment orders via `paidPreorderOrder` + `fulfillmentOrdersOf` factories.
- **`moveDate(productId, to)`** – Calls `productService.updateById` to change (or clear) the release date, then flushes the outbox with `settleOutboxNudges`.
- **`waitingOf` / `waitingIdOf` / `consentOf`** – Query helpers that fetch the single fulfillment order in `awaiting_stock` hold for an order.
- **`delayedEvents` / `expiredEvents`** – Read `fulfillment_order.delayed` / `wait_expired` rows from `outboxEventModel` for assertions.
- **`describe('a release date that moves')`** – Covers: short slip (notify only, no consent needed), long slip > 28 days (opens 30-day consent window), second slip (asks again), date moved earlier (silent), date cleared (asks with no `expectedAt`), idempotent redelivery, and a fulfillment order that is no longer waiting.
- **`describe('the buyer saying keep waiting')`** – Tests `confirmWait`: success path, refusal when not awaiting, authorization (stranger → 404, staff → 403), and UI action visibility via `getForOrder` before/after answering.
- **`describe('the daily sweep')`** – Tests `runPreorderSweep`: asks once for a passed date, is idempotent on re-run, skips future dates, skips already-allocated goods, and does not re-ask after the buyer confirmed.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is the sole mock; tests assert call count as a proxy for "email was sent."
- **`src/kernel/events.ts`** – `resetDomainEvents` / `markDomainEventsWired` manage the event-bus lifecycle in `beforeEach` / `afterEach`.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried directly for event assertions; `settleOutboxNudges` flushes pending outbox writes after state-changing calls.
- **`src/modules/delivery/module.ts`** – `deliveryModule.subscribe()` wires domain-event handlers so the product-date-change event reaches delivery services.
- **`src/modules/delivery/services/index.ts`** – Exports `getForOrder`, `runPreorderSweep`, `cancelAllForOrder`, and (dynamically) `onReleaseDateChanged` under test.
- **`src/modules/delivery/services/confirm-wait.ts`** – The `confirmWait` handler is the primary SUT for the buyer-consent block.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` and `fulfillmentOrdersOf` seed the test fixture.
- **`src/modules/orders/tests/factories.ts`** – `timelineOf` is imported (used by the preorder factory internally).
- **`src/modules/products/index.ts`** – `productService.updateById` is the admin action that triggers the date-change event.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `testCallerContext` build auth contexts for each call.
- **`tests/support/response.ts`** – `asReject` narrows failure responses for status/code assertions.

## Notes

- The mailer mock is at the **queue** level (`enqueueEmail`), not HTTP; the outbox still runs for real.
- `settleOutboxNudges()` must be called after any action that writes outbox events before asserting on `outboxEventModel`; forgetting it makes event assertions flaky.
- Domain events are **not** auto-wired by the test DB setup—`deliveryModule.subscribe()` + `markDomainEventsWired()` in `beforeEach` is required, or date-change events will silently drop.
- The idempotency test imports `onReleaseDateChanged` dynamically to simulate a redelivered event without re-triggering the product service.
- `inDays` is relative to `Date.now()` at call time; the 28/30-day consent-window assertion uses a 0.1-day tolerance to absorb clock drift within the test run.
