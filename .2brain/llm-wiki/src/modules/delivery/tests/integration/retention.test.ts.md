---
source: src/modules/delivery/tests/integration/retention.test.ts
sha256: 8f0b1f21faa044374b52f435f58542cc74e7a33440e3f49e38ffb99d0d34258b
generated_at: 2026-10-14T15:38:01.117528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/retention.test.ts

## Purpose

Integration test suite for the `reap:delivery` retention task (`scrubHoldNotes`). It verifies against a real database that hold notes older than the configured retention window are unset while all other fields on the fulfillment order remain untouched, and that the operation is idempotent.

## Key elements

- **`heldAged(ageDays)`** — helper that creates a full user → product → order → fulfillment-order chain, then force-writes `status: 'on_hold'`, `holdReason`, `holdNote`, and a backdated `updatedAt` (using `timestamps: false` to bypass Mongoose's automatic stamp).
- **`stored(id)`** — raw `.lean()` read of a fulfillment order by id, used for post-scrub assertions.
- **`describe('scrubHoldNotes')`** — four tests:
  - Old note is unset; `status`, `holdReason`, `lines`, and `updatedAt` are unchanged.
  - Note within the window is preserved.
  - Second invocation returns 0 and mutates nothing (idempotency).
  - Passing an explicit `Date` to `scrubHoldNotes` shifts the cutoff relative to that date rather than `Date.now()`.
- **`beforeEach`** — sets `NODE_HOLD_NOTE_RETENTION_DAYS` to `30` via `setEnvironment`.

## Relationships

- **`src/modules/delivery/services/retention.ts`** — provides `scrubHoldNotes`, the function under test.
- **`src/modules/delivery/model.ts`** — provides `fulfillmentOrderModel`, used both to write backdated test data and to read back stored documents.
- **`src/modules/delivery/tests/factories.ts`** — provides `fulfillmentOrdersOf`, which resolves the fulfillment order(s) for a given order id.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the customer for each scenario.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the line-item product.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the parent order and its items.
- **`src/types/index.ts`** — `OrderStatus.processing` is the initial order status.
- **`tests/support/environment.ts`** — `setEnvironment` injects the retention-window env var per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions and tears down the real database for the suite.

## Notes

- The helper `heldAged` uses `timestamps: false` on `updateOne` specifically so the backdated `updatedAt` survives; without it, Mongoose would overwrite the timestamp with the current time and the age-based assertions would be meaningless.
- The module-level `let customers = 0` counter ensures each `createUser` call gets a unique email, avoiding factory collisions across tests that share a database.
- The "unchanged clock" assertion (`updatedAt` equality) guards against an implementation that accidentally triggers Mongoose `updatedAt` bumping during the scrub.
