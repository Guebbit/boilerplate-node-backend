---
source: src/modules/delivery/services/retention.ts
sha256: a748507222cd9ed1166cac47d29b97d70729cf309a2107f86c2c822bda614a48
generated_at: 2026-10-14T15:33:02.162163+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/retention.ts

## Purpose

Data-retention service that wipes free-text `holdNote` values from fulfillment orders once they have been quiet (unchanged) for a configurable number of days. It exists so the ops sweep script can call a single, well-scoped function rather than inlining the date arithmetic and repo call.

## Key elements

- **`scrubHoldNotes(now?: Date): Promise<number>`** — the sole export. Computes a cutoff (`now − holdNoteRetentionDays() × DAY_MS`), delegates to `fulfillmentOrderRepository.scrubHoldNotesBefore(cutoff)`, logs an info line only when `scrubbed > 0`, and returns the affected-row count.
- **`DAY_MS`** — module-private constant (24 h in ms) used for the retention window math.

## Relationships

- **`src/modules/delivery/config.ts`** — provides `holdNoteRetentionDays()` (reads `NODE_HOLD_NOTE_RETENTION_DAYS`), which sets the retention window.
- **`src/modules/delivery/repository.ts`** — provides `fulfillmentOrderRepository.scrubHoldNotesBefore(cutoff)`; this file is the sole caller of that method.
- **`src/infrastructure/adapters/logger.ts`** — used for the single info-level log emitted when rows are actually scrubbed.
- **`scripts/ops/reap-delivery.ts`** — the operational entry-point that invokes `scrubHoldNotes` during its periodic sweep.
- **`src/modules/delivery/services/index.ts`** — re-exports `scrubHoldNotes` as part of the delivery-services barrel.
- **`src/modules/delivery/tests/integration/retention.test.ts`** — integration tests that exercise the full path (config → service → repository) without fake timers by injecting `now`.

## Notes

- The cutoff is based on `updatedAt`, **not** a closing date, because a fulfillment order that is held indefinitely never gets a close timestamp. Do not "fix" this to use a close date.
- `now` is injectable specifically so tests avoid `jest.useFakeTimers()`; production callers omit the argument.
- The `// Stryker disable next-line all` comment suppresses mutation testing on the log line (logging has no observable effect on return value).
- Log is emitted only when `scrubbed > 0`, so a no-op sweep produces no log noise.
