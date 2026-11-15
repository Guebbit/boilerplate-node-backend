---
source: src/modules/delivery/tests/integration/order-status-races.test.ts
sha256: 2aa5e1dbe7d308161b4ab21fecfb24223b52e44f1380bb6a6ce40f011af34e95
generated_at: 2026-11-14T19:52:58.708104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/order-status-races.test.ts

## Purpose

Integration tests that verify the delivery ship-door and the order cancel endpoint are mutually exclusive under real concurrent HTTP contention. They assert that N simultaneous ship requests produce exactly one 201 (and one email), that a ship racing a cancel leaves a single coherent outcome, and that a lost-update on `markProcessing` is surfaced as a 409 rather than a silent half-ship.

## Key elements

- **`SHIPMENT_WON` / `CANCEL_WON`** — frozen expected-state objects (status codes, order status, shipment count, fulfillment-order status) used to assert the ship-vs-cancel test matches exactly one whole outcome.
- **`describe('two admins racing the same ship door')`** — fires `RACE_SIZE` concurrent POSTs to `/delivery/…/shipments`; asserts one 201, the rest 409, one `enqueueEmail` call, one stored shipment. A second test races partial-quantity lines and expects exactly 3 winners (one per unit).
- **`describe('a ship racing a cancel of the whole order')`** — issues ship and cancel via `Promise.all`; after outbox settlement, asserts the combined observation equals `SHIPMENT_WON` or `CANCEL_WON` (never a hybrid).
- **`describe('a first shipment from a paid order that moved away meanwhile')`** — spies on `orderService.markProcessing` to return `null` (simulating the order moved to another status between read and write); asserts 409 with `ORDER_NOT_PAID`, zero shipments, order unchanged.
- **Mailer mock** — `jest.mock('@infrastructure/adapters/mailer')` replaces `enqueueEmail` with a jest function so call-count is the assertion surface.
- **`setupTestDb()`** — top-level call provisions the test database before any test runs.

## Relationships

- **`tests/support/race.ts`** — provides `RACE_SIZE`, `raceN`, `countStatus`, `expectNoServerErrors`; the concurrency primitive behind every test here.
- **`tests/support/http.ts`** — `api()` and `authenticateAs('admin')` build the authenticated Supertest requests.
- **`tests/support/eventually.ts`** — `eventually` polls until the outbox relay has delivered the email, bridging async relay timing.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the database fixture for the whole file.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the mocked unit under count; the test never sends real mail.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the outbox so the mailer mock (and cancel-listener side-effects) are observable.
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `shipmentsOf` read the persisted state the tests assert against.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build and read the order fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the product referenced by order items.
- **`src/modules/orders/index.ts`** — exports `orderService`, whose `markProcessing` is spied on in the lost-update test.
- **`src/types/index.ts`** — `OrderStatus` enum values (`processing`, `shipped`, `canceled`, `paid`) used in setup and assertions.

## Notes

- Every racer carries a unique `Idempotency-Key` (`randomUUID()`); without this the server would deduplicate and the test would not exercise real contention.
- The last test ("paid order that moved away") **cannot** be triggered by genuine race timing. It explicitly mocks `orderService.markProcessing` to return `null`, simulating the condition where the order was cancelled between the read and the conditional write.
- Email verification requires two `settleOutboxNudges` calls (one inside `eventually`, one after) because the mail rides `shipment.shipped` through the relay; a single settle may miss a straggler.
- `afterEach(jest.restoreAllMocks)` ensures the `markProcessing` spy and mailer mock reset between tests; the mailer mock's call counter is not reset by this, so tests that assert call-count must be the only ones in the file relying on it.
