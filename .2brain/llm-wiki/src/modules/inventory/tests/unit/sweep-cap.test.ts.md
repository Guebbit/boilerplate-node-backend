---
source: src/modules/inventory/tests/unit/sweep-cap.test.ts
sha256: bbf323f45f788921d7dad44c66a08f61e4c7663280a545bca1db01d44203694e
generated_at: 2026-11-08T06:08:58.702335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/sweep-cap.test.ts

## Purpose

Unit test for `inventoryService.runReservationSweep` that verifies the batch-count cap: the sweep must stop after reading 50 consecutive full batches, emit a single warning that more work remains, and terminate cleanly so it cannot outlive its job lease. A second case confirms that a short (incomplete) batch stops the loop early with no warning.

## Key elements

- **`fullBatch`** — A 200-element array of fake `orderId` objects representing one "full" batch (the repository's page size).
- **Mock of `@kernel/outbox`** — Replaces `announceInTransaction` with a no-op so no hold is actually released; the test isolates the loop mechanics from the release side-effect.
- **`describe('runReservationSweep — the cap')`**
  - *Test 1:* Spies on `findExpired` to always return `fullBatch`, asserts exactly **50** calls and **1** `logger.warn` call.
  - *Test 2:* Spies on `findExpired` to return `fullBatch` once then a 3-item slice; asserts **2** calls and **0** warnings.
- **`afterEach`** — Calls `jest.restoreAllMocks()` to reset spies between tests.

## Relationships

- **`src/modules/inventory/services/index.ts`** — Provides `inventoryService.runReservationSweep()`, the function under test.
- **`src/modules/inventory/repository.ts`** — Provides `reservationRepository.findExpired`, spied and mocked to control batch size per iteration.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger.warn`, spied to assert the single warning emitted when the 50-batch cap is reached (and its absence on early stop).

## Notes

- The cap constant (50) is implicit in the assertion; the service under test owns the limit.
- `fullBatch.length` (200) must match the repository's actual page size for the "full" vs. "short" distinction to be meaningful; changing the page size in the service will break these tests silently.
- The `@kernel/outbox` mock is module-level (top of file), not inside individual tests, and is never unmocked within this file.
