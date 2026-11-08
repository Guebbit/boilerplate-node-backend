---
source: src/modules/stock-alerts/jobs.ts
sha256: caf9102f9bf47459420bafc882498e0d81118410cc1754022e361da019e17d37
generated_at: 2026-11-08T08:28:21.457342+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `stock-alerts` module. The single job is an hourly sweep that promotes preorders whose release date has passed, turning them into orderable products without requiring an explicit write.

## Key elements

- **`stockAlertsJobs`** (`readonly JobDeclaration[]`) — the module's job declarations consumed by the scheduler.
- **`sweepStockAlerts` job entry** — built by spreading generated metadata from `./jobs.generated`, then overriding with:
  - `run` — calls `stockAlertService.sweepBuyable(new Date())`, logs the resulting product list, then calls `settleOutboxNudges()` to flush any inbox rows before the lease expires.
  - `needs` — declares that `subscriptions` and `i18n` services must be available at runtime.
  - `lease.ttlMs` — 30 minutes (`30 * MINUTE_MS`).

## Relationships

- **`src/modules/stock-alerts/service.ts`** — calls `stockAlertService.sweepBuyable` to perform the actual promotion of buyable products.
- **`src/kernel/outbox.ts`** — calls `settleOutboxNudges()` to deliver queued notifications within the lease window.
- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type that shapes the exported array.
- **`src/infrastructure/adapters/logger.ts`** — uses `logger.info` to record sweep completion and the affected products.
- **`src/domain-primitives/time.ts`** — imports `MINUTE_MS` as the unit for the lease TTL.
- **`src/modules/stock-alerts/module.ts`** — consumes `stockAlertsJobs` to register this module's jobs with the scheduler.

## Notes

- The generated metadata in `./jobs.generated` is the source of truth for the job's name, schedule, and other static fields; this file only supplies the runtime `run` closure and operational config.
- `settleOutboxNudges()` is intentionally sequenced *after* the sweep and *inside* the lease so that the `notifications` consumer has heard every inbox row before the job's connections close.
- The `needs` field is a declaration checked at dispatch time, not an import — the job will not be scheduled if those services are absent.
