---
source: src/modules/returns/tests/integration/retention.test.ts
sha256: fe7c074a3914076c3db1ceb8c4e07b068b605f878da015adcc6847acb56ac3df
generated_at: 2026-10-29T05:49:00.398215+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/retention.test.ts

## Purpose

Integration test for the `scrubReturnText` service (the `reap:returns` job) run against a real database. It verifies that free-text fields (`note`, `declineMessage`) are unset on returns past the retention window while all structured data (reason codes, status, lines, currency, `decidedAt`) is preserved, that returns inside the window are untouched, that the operation is idempotent, and that the repository-level method accepts a custom cutoff.

## Key elements

- **`returnAged(ageDays)`** – Creates a full chain (user → product → delivered order → return doc) and backdates `updatedAt` by `ageDays` using `returnModel.updateOne` with `{ timestamps: false }` so Mongoose doesn't overwrite it.
- **`stored(id)`** – Reads a return document raw via `returnModel.findById(id).lean().exec()`.
- **`describe('scrubReturnText')`** – Six cases:
  - Past-window return: both texts unset; structured fields (`declineReason`, `status`, `reason`, `currency`, `lines`, `decidedAt`, `updatedAt`) intact.
  - Inside-window return: both texts retained.
  - Return with only `declineMessage` (no `note`): still scrubbed.
  - Return with only `note` (no `declineMessage`): still scrubbed.
  - Rerun: second call returns `0` (idempotency).
  - `returnRepository.scrubFreeTextBefore(cutoff)`: honors an explicit date argument rather than the env-var window.
- **`WINDOW_DAYS` / `DAY_MS`** – Constants defining the 30-day test window.
- **`beforeEach`** – Sets `NODE_RETURN_TEXT_RETENTION_DAYS` via `setEnvironment` so the service reads a known value.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/returns/services/retention.ts` | Calls `scrubReturnText()` (the unit under test). |
| `src/modules/returns/model.ts` | Uses `returnModel` to create, update, and read return documents. |
| `src/modules/returns/repository.ts` | Calls `returnRepository.scrubFreeTextBefore(date)` in the custom-cutoff test. |
| `src/modules/users/tests/factories.ts` | `createUser` seeds the customer. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the item. |
| `src/modules/orders/tests/factories.ts` | `createOrder` / `toOrderItem` seed the delivered order. |
| `src/types/index.ts` | Imports `OrderStatus.delivered`. |
| `tests/support/environment.ts` | `setEnvironment` injects the retention-days env var before each test. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` connects a real (ephemeral) database for the whole suite. |

## Notes

- This is a **real-database** integration test (no Mongoose mocks). It requires the test DB from `setupTestDb`.
- The backdating trick (`$set: { updatedAt }` with `{ timestamps: false }`) is necessary because Mongoose's automatic `timestamps` option would stamp `updatedAt` to "now," defeating the age check.
- A module-level `customers` counter guarantees unique emails so each test gets a distinct user without clearing the DB between cases.
- The test asserts `not.toHaveProperty('note')` (field absent) rather than `toBeNull()` or `toBe('')`, matching the service's `$unset` behavior.
