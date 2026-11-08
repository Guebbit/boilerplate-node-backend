---
source: src/modules/orders/tests/integration/service-override.test.ts
sha256: c9e42d8377061057418eabac1a973d4a1934c04a3c7e5ec22bf3d25975cb805d
generated_at: 2026-11-08T07:09:50.564818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-override.test.ts

## Purpose

Integration tests for the `overrideStatus` admin service, run against a real MongoDB instance. The file verifies the conditional-write guarantee (atomic compare-and-swap on status), event emission, history recording, and every guard rule the override door enforces (digital-only restrictions, `paid`/`pending` boundaries, backward moves, race rejection, stock guards, and menu filtering).

## Key elements

- **`describe('overrideStatus on a digital-only order')`** — asserts `shipped` is refused (409, no parcel) and that `delivered` computes `withdrawUntil` from the payment timestamp (+30 days, end-of-day).
- **`describe('overrideStatus')`** — core behavioural suite:
  - Forward move records a `status_overridden` timeline entry and emits `ORDER_STATUS_CHANGED`.
  - `paid` is a system-only destination (always refused).
  - `pending` is a source-only state (no outgoing override allowed).
  - Backward moves are refused.
  - **Race test**: spies on `orderRepository.findByIdScoped`, injects a competing write between read and write, expects 409 and zero timeline entries.
  - History `from` field reflects the stored pre-state.
  - No parcel/shipment side-effects are created.
- **`describe('the override event')`** — verifies `ORDER_STATUS_OVERRIDDEN` payload shape (includes `at`, `mode`); stock-guard refusal (`ORDER_OVERRIDE_AWAITING_STOCK`); `processing` still permitted when stock is pending; `withActions` menu excludes `shipped`/`delivered` while units await stock.
- **`setupTestDb()` / `markDomainEventsWired()` / `resetDomainEvents()`** — lifecycle hooks ensuring a clean Mongo and a wired event bus per test.
- **`settleOutboxNudges()`** — awaited after `overrideStatus` to flush async outbox delivery before event assertions.

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `services/override.ts` | System under test; imports `overrideStatus`. |
| `services/actions.ts` | Imports `withActions` to assert the override menu excludes invalid targets. |
| `model.ts` | Imports `orderModel` for direct document writes (race injection, stock fixture setup). |
| `repository.ts` | Imports `orderRepository` to spy on `findByIdScoped` in the race test. |
| `events.ts` (orders) | Imports `ORDER_STATUS_CHANGED`, `ORDER_STATUS_OVERRIDDEN` for subscription and payload shape. |
| `kernel/events.ts` | Imports `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for bus wiring and capture. |
| `kernel/outbox.ts` | Imports `settleOutboxNudges` to flush the outbox relay before assertions. |
| `tests/factories.ts` | Imports `seedOrder`, `seedDigitalOrder`, `readOrder`, `timelineOf`. |
| `types/index.ts` | Imports `OrderStatus` enum. |
| `tests/support/callers.ts` | Imports `asAdmin`, `callerContextAs` for admin-actor context. |
| `tests/support/setup-test-db.ts` | Imports `setupTestDb` for real-Mongo bootstrap. |

## Notes

- **Real Mongo, not mocks.** The file's doc-block explains: the guarantee under test is the conditional write (compare-and-swap), and a mock "cannot race against itself." The sole exception is the race test, which spies on the repository read to inject a competing write — the one scenario a pure mock would trivially satisfy.
- **`settleOutboxNudges()` is mandatory** before asserting on domain events; the outbox relay delivers asynchronously, and skipping it causes flaky empty-array assertions.
- **Two events fire per override**: `ORDER_STATUS_CHANGED` (universal, what webhooks/filter listeners read) and `ORDER_STATUS_OVERRIDDEN` (override-specific announcement). Tests assert both independently.
- **Digital-only orders** get special guard logic: `shipped` is semantically invalid (no parcel), and `delivered` triggers a 30-day withdrawal window anchored to the payment date rather than the override time.
- **Menu filtering is tested at the service layer** via `withActions`, not at the UI: it confirms the door's own stock guard prevents the menu from offering a target the door would 409 on.
