---
source: src/modules/inventory/tests/unit/sweep-cap.test.ts
source_sha256: bbf323f45f788921d7dad44c66a08f61e4c7663280a545bca1db01d44203694e
context_sha256: 8a5013b1178a68213829c8638c6f377e741b8b1934b15c6b57b65d6d49d1e580
generated_at: 2026-11-22T05:28:58.100131+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/unit/sweep-cap.test.ts

## Purpose
Unit tests for the cap on the reservation sweep (`inventoryService.runReservationSweep`). The sweep drains expired reservations in full batches but stops after 50 batches and logs a warning, so a pathological backlog ends a run rather than outliving the job's lease. The tests exercise the loop only, not the actual holds or releases.

## Key elements
- `jest.mock('@kernel/outbox', ...)`: keeps the real module but replaces `announceInTransaction` with a mock resolving `null`. No hold is ever released, so each hold is skipped and the loop continues.
- `fullBatch`: 200 fake holds, each with a 24-character hex-style `orderId`.
- Test "reads 50 full batches at most, and warns once…": `findExpired` always returns a full batch. It asserts `findExpired` was called 50 times and `logger.warn` once.
- Test "stops at the first batch that comes back short…": `findExpired` returns a full batch and then a 3-item batch. It asserts 2 calls and no warning.
- `afterEach(() => jest.restoreAllMocks())`: undoes the spies between tests.

## Relationships
- `src/modules/inventory/services/index.ts`: provides `inventoryService`, whose `runReservationSweep` is the code under test.
- `src/modules/inventory/repository.ts`: provides `reservationRepository`. Its `findExpired` is spied on and stubbed to feed the batches.
- `src/infrastructure/adapters/logger.ts`: provides `logger`. Its `warn` is spied on, with a no-op implementation returning `logger`, to check the cap warning.

## Notes
- The `@kernel/outbox` mock is declared before the repository and service imports. That ordering is deliberate: the mock must be set up before the service is loaded.
- A batch is "full" at 200 items; any shorter batch ends the sweep without a warning.
