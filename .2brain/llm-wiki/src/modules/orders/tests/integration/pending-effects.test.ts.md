---
source: src/modules/orders/tests/integration/pending-effects.test.ts
sha256: 9ead3ece476557b43ca1ba710e9bc68a2de2007ae6c077ab924c49ff5112013b
generated_at: 2026-10-15T11:15:50.740015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pending-effects.test.ts

## Purpose

Integration tests for the **pending-effects durability mechanism**: when `cancelById` fires `ORDER_REFUND_OWED` and the refund handler throws, a `pendingEffects: ['refund']` marker is written into the order document so that `retryPendingEffects` can later re-announce the event. These tests verify the full write → fail → sweep → discharge cycle against **real MongoDB** (no stubbed repository), because the guarantees depend on the shape of the conditional `$set`/`$pull` writes and the sparse-index query.

## Key elements

- **`seedOrder`** — Creates a fresh user, product, and `pending` order per test case (unique email/username via a `seeded` counter to avoid collisions within a case).
- **`storedEffects(orderId)`** — Helper that re-reads the order from the repository and returns its `pendingEffects` array; always reads from the DB rather than trusting the in-memory document the service returned.
- **`describe('cancelById — writing the intent down')`** — Four tests covering: marker survives a throwing refund; marker drains on a successful refund; no marker when `refund: false`; marker is absent from the serialized (`withActions`) wire shape.
- **`describe('retryPendingEffects')`** — Five tests covering: first sweep re-announces and settles; second sweep is a no-op (idempotence); marker persists if the retry also throws; orders that owe nothing are ignored; grace window (`NODE_ORDER_EFFECT_RETRY_MINUTES`) defers the sweep.
- **`beforeEach`** — Sets `NODE_ORDER_EFFECT_RETRY_MINUTES` to `'0'` so the grace window is zeroed and a marker written in the same millisecond is immediately due.
- **`afterEach`** — Resets the env var and calls `resetDomainEvents()` to clear any `onDomainEvent` handlers registered by the test.

## Relationships

- **`@kernel/events`** (`onDomainEvent`, `resetDomainEvents`) — Registers throw/return handlers for `ORDER_REFUND_OWED` to simulate refund success or failure; reset between cases.
- **`../../events`** (`ORDER_REFUND_OWED`) — The domain event constant that drives the refund side-effect under test.
- **`../../repository`** (`orderRepository`) — Used exclusively to *read back* the persisted document after each service call, asserting what Mongo actually stored.
- **`../../services`** (`orderService`) — The system under test: `cancelById` and `retryPendingEffects`.
- **Factories** (`createUser`, `createProduct`, `createOrder`, `toOrderItem`) — Seed a minimal user/product/order trio per test.
- **`@tests/callers`** (`asAdmin`) — Supplies the caller context for service calls.
- **`@tests/environment`** (`setEnvironment`) — Controls the `NODE_ORDER_EFFECT_RETRY_MINUTES` grace-window setting per test.
- **`@tests/setup-test-db`** (`setupTestDb`) — Boots a real in-memory (or temp) Mongo instance for the whole suite.

## Notes

- Tests assert against the **stored document** (via `orderRepository.findById`), not the object `cancelById` returns. The file's doc comment calls this out explicitly: a stubbed repository would only assert the stub.
- The `seeded` counter is reset in `beforeEach` so each *case* gets fresh emails, but tests within a single case that create multiple users are distinguished by incrementing `seeded`.
- The grace-window test (`'5'` minutes) overrides the `beforeEach` zero setting; the `afterEach` still resets it back to `undefined`.
- `pendingEffects` is expected to be **undefined** (not an empty array) when no refund was requested — the field simply isn't written.
