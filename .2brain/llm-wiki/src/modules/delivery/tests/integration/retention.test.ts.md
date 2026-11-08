---
source: src/modules/delivery/tests/integration/retention.test.ts
sha256: fc8ad6ef63fd3bcca14535f03a4cace62d356a166c4ab92be32254b82aea8dc3
generated_at: 2026-11-08T05:44:22.119768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/retention.test.ts

## Purpose

Integration tests for the `scrubHoldNotes` retention job against a real database. Verifies that hold notes older than the configured retention window are cleared while all other fields on the fulfillment order (status, reason, lines) remain untouched, that notes inside the window are preserved, and that a second run is a no-op.

## Key elements

- **`heldAged(ageDays)`** – Creates a user, product, and processing order, then force-writes the fulfillment order to `status: 'on_hold'` with a backdated `updatedAt`. Uses `{ timestamps: false }` to bypass Mongoose's automatic clock stamping.
- **`stored(id)`** – Reads a fulfillment order raw (`.lean()`) for assertions.
- **`WINDOW_DAYS` (30)** – The retention window in days, injected via the `NODE_HOLD_NOTE_RETENTION_DAYS` env var in `beforeEach`.
- **`describe('scrubHoldNotes')`** – Four cases: old note is cleared (and `updatedAt` unchanged), young note survives, idempotent second run, and custom reference-date parameter.

## Relationships

- **`src/modules/delivery/services/retention.ts`** – The system under test; imports `scrubHoldNotes`.
- **`src/modules/delivery/model.ts`** – Imports `fulfillmentOrderModel` to directly mutate and query the DB (bypassing the service layer for setup).
- **`src/modules/delivery/tests/factories.ts`** – Imports `fulfillmentOrdersOf` to locate the fulfillment order created by the order factory.
- **`src/modules/orders/tests/factories.ts`** – Imports `createOrder`, `toOrderItem` for order scaffolding.
- **`src/modules/products/tests/factories.ts`** – Imports `createProduct` for product scaffolding.
- **`src/modules/users/tests/factories.ts`** – Imports `createUser` for customer scaffolding.
- **`src/types/index.ts`** – Imports `OrderStatus.processing` for the initial order status.
- **`tests/support/environment.ts`** – Imports `setEnvironment` to inject the retention-window env var per test.
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb` for real-database lifecycle.

## Notes

- The `customers` counter guarantees unique emails across tests within the file (avoids collision on the email index).
- The critical assertion that `updatedAt` does **not** change after scrubbing guards against the retention service accidentally triggering `updatedAt` via a Mongoose save.
- `scrubHoldNotes` accepts an optional reference-date parameter (used in the last test); the default is "now".
