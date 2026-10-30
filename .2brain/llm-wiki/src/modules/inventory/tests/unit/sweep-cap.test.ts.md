---
source: src/modules/inventory/tests/unit/sweep-cap.test.ts
sha256: bbf323f45f788921d7dad44c66a08f61e4c7663280a545bca1db01d44203694e
generated_at: 2026-10-29T04:09:37.118712+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/sweep-cap.test.ts

## Purpose

Unit tests for `runReservationSweep`'s batch-cap guard: the sweep must stop after 50 full batches and log a single warning that work remains, rather than looping unboundedly and outliving the job's lease. The tests isolate the loop logic by mocking the repository and suppressing all hold releases.

## Key elements

- **`fullBatch`** — a 200-entry array of synthetic `{ orderId }` objects (hex-padded IDs) representing one "full" batch of expired holds.
- **`jest.mock('@kernel/outbox', …)`** — patches `announceInTransaction` to resolve `null` so no hold is ever released; the loop's termination must come from the cap, not from an empty release.
- **`describe('runReservationSweep — the cap')`** — two test cases:
  - *50 full batches + one warning*: asserts `findExpired` is called exactly 50 times and `logger.warn` fires once.
  - *Short batch stops the loop, no warning*: first call returns 200 holds, second returns 3; asserts `findExpired` is called 2 times and `warn` is never called.
- **`afterEach`** — restores all spies/mocks between tests.

## Relationships

- **`src/modules/inventory/services/index.ts`** — the test's subject; calls `inventoryService.runReservationSweep()` to exercise the cap logic.
- **`src/modules/inventory/repository.ts`** — spied on via `reservationRepository.findExpired` to control what each batch returns.
- **`src/infrastructure/adapters/logger.ts`** — spied on via `logger.warn` to assert (or disprove) the single warning.
- **`@kernel/outbox`** (mocked) — `announceInTransaction` is neutralised so the release path never influences loop termination.

## Notes

- The mock of `@kernel/outbox` is a module-level `jest.mock` (hoisted), so it applies before any import resolves. It preserves all real exports via `jest.requireActual` and overrides only `announceInTransaction`.
- `fullBatch` uses `padStart(24, 'a')` for deterministic, unique IDs; the actual value is irrelevant since the release path is mocked out.
- The test name and module doc intentionally reference "the job's lease" — the cap exists to protect against the sweep outliving its allocated time window, not just to bound CPU.
