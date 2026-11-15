---
source: src/modules/stock-alerts/jobs.ts
sha256: 0d5e115c5e4669fbcbf3d66253a65c4216f8e4fdcc99c5d59604d9f12efe0d19
generated_at: 2026-11-14T22:03:05.359812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/jobs.ts

## Purpose

Declares the single scheduled job owned by the `stock-alerts` module: a periodic sweep that picks up preorders whose release date has passed and makes them buyable. Separated from `service.ts` so the job's scheduling metadata, lease, and execution entry-point live in one place.

## Key elements

- **`stockAlertsJobs: readonly JobDeclaration[]`** — the sole export. Contains one entry whose shape comes from `stockAlertsJobData.sweepStockAlerts` (a generated file) spread, then overridden with a `run` closure and a `lease`.
- **`run` closure** — calls `stockAlertService.sweepBuyable(new Date())`, then logs an info line with the resulting `products` array.
- **`lease: { ttlMs: 30 * MINUTE_MS }`** — 30-minute lease, sourced from `MINUTE_MS` in the time primitives.

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes each entry in the array.
- **`src/infrastructure/adapters/logger.ts`** — used to emit a post-sweep info log.
- **`src/domain-primitives/time.ts`** — supplies the `MINUTE_MS` constant for the lease TTL.

## Notes

- The docblock calls the job "hourly"; the actual cadence is defined in `jobs.generated`, not here.
- `run` is a bare `() =>` arrow (no arguments), meaning the job framework calls it with no parameters; the current time is captured inside the closure.
- The spread of `stockAlertsJobData.sweepStockAlerts` means the generated file is the source of truth for the job's identity/schedule; editing this file only overrides `run` and `lease`.
