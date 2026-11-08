---
source: src/modules/returns/services/retention.ts
sha256: ea6ae3e74f01b95b166acdb41c4e26d4632514926248d82d90df6ab918bc6fcb
generated_at: 2026-11-08T08:06:16.621417+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/retention.ts

## Purpose

Implements the free-text retention sweep for returns: after a return has been quiet (no updates) for longer than a configured number of days, its free-text fields are wiped while the row itself remains as a legal record. Exposes a single function consumed by the `reap:returns` job.

## Key elements

- **`scrubReturnText(): Promise<number>`** — Computes a cutoff date (`now − returnTextRetentionDays() × DAY_MS`), calls `returnRepository.scrubFreeTextBefore(cutoff)` to unset `note` and `declineMessage` on qualifying rows, logs an info line if any rows were affected, and resolves with the scrubbed count.

## Relationships

- **`src/modules/returns/repository.ts`** — Calls `returnRepository.scrubFreeTextBefore(date)`; the repository owns the actual SQL/ORM operation.
- **`src/modules/returns/config.ts`** — Reads `returnTextRetentionDays()` (a function, so the value may be env-derived) to determine the retention window.
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` for the millisecond arithmetic in the cutoff calculation.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` to emit the post-sweep info log.
- **`src/modules/returns/jobs.ts`** — Expected caller of `scrubReturnText` as the `reap:returns` sweep (per the module docstring).
- **`src/modules/returns/services/index.ts`** — Re-exports this module so consumers can import from the services barrel.
- **`src/modules/returns/tests/integration/retention.test.ts`** — Integration tests exercising `scrubReturnText` against a real database.

## Notes

- **`updatedAt` is the clock**, not the closing/approval date. An approved return whose goods never arrive stays "quiet" as long as no staff action touches it, and gets scrubbed on the same timeline as any other return.
- **Only free text is targeted.** The reason code (a constrained value, not free text) and the row itself are never modified or deleted.
- The retention threshold is read via a *function call* (`returnTextRetentionDays()`), implying it can vary at runtime (e.g., per-environment config) rather than being a fixed constant.
- A Stryker `disable` comment suppresses mutation testing on the `logger.info` line, since mutating a pure logging side-effect is meaningless.
