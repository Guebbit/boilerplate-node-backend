---
source: src/modules/returns/services/retention.ts
sha256: ea6ae3e74f01b95b166acdb41c4e26d4632514926248d82d90df6ab918bc6fcb
generated_at: 2026-10-29T05:45:10.051437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/retention.ts

## Purpose

Implements the free-text retention sweep for returns: once a return's `updatedAt` exceeds the configured quiet period, its human-authored text fields (`note`, `declineMessage`) are unset while the structured row (and reason codes) is preserved as a legal record. Exists to satisfy the data-retention policy described in `docs/theory/data-retention.md#free-text-on-returns`.

## Key elements

- **`scrubReturnText(): Promise<number>`** — The single export. Computes a cutoff date (`now − returnTextRetentionDays() * DAY_MS`), calls `returnRepository.scrubFreeTextBefore(cutoff)`, logs a summary line only when at least one row was affected, and resolves with the scrubbed count. Designed to be invoked by the `reap:returns` job.

## Relationships

- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` for the date arithmetic that derives the cutoff.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; writes a single `info` entry when `scrubbed > 0`.
- **`src/modules/returns/config.ts`** — Imports `returnTextRetentionDays()` to obtain the configurable retention window (days).
- **`src/modules/returns/repository.ts`** — Imports `returnRepository`; calls `scrubFreeTextBefore(date)` to perform the actual column-level `SET NULL` at the data layer.
- **`src/modules/returns/jobs.ts`** — Expected consumer of `scrubReturnText` as part of the scheduled `reap:returns` sweep.
- **`src/modules/returns/services/index.ts`** — Barrel re-export so the function is reachable via the service namespace.
- **`src/modules/returns/tests/integration/retention.test.ts`** — Integration tests that exercise `scrubReturnText` against a real repository.

## Notes

- The retention clock is **`updatedAt`, not the return's closing/approval date**. An approved return whose goods never arrive keeps its text for as long as staff leave it untouched; it is not grandfathered.
- `declineMessage` is treated as free text and is wiped; structured reason codes are **not** touched.
- `returnTextRetentionDays()` is a function call (not a constant), implying the value is resolved at runtime (likely an environment variable via `config.ts`).
- A `// Stryker disable next-line all` comment sits above the `logger.info` call to suppress mutation testing on a pure side-effect line.
