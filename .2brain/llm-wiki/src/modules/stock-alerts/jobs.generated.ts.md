---
source: src/modules/stock-alerts/jobs.generated.ts
sha256: c64d4a0c557f82c5e38d139b29f34a5930635c254cea7a27e142cc0a4f9bdc47
generated_at: 2026-10-29T05:58:21.238291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/jobs.generated.ts

## Purpose

Auto-generated registry of scheduled job metadata (name, cron schedule, summary) for the stock-alerts module. It exists as a single source of job *definitions* derived from `module.yaml`, so that `jobs.ts` can attach execution logic without duplicating schedule/name data.

## Key elements

- **`stockAlertsJobData`** (exported const) — A `as const` object whose keys are job identifiers and whose values carry `name`, `schedule` (cron string), and `summary`. Currently defines one job:
  - `sweepStockAlerts` — cron `35 * * * *`; answers back-in-stock requests for products that became orderable (e.g., a past-due preorder) without requiring a write to trigger the notification.

## Relationships

- **`src/modules/stock-alerts/jobs.ts`** — Imports `stockAlertsJobData` to pair each entry with its handler function. This file supplies *what* to schedule; `jobs.ts` supplies *how* to run it.

## Notes

- **Do not edit.** The header comment and `@module` tag both state the file is regenerated from `src/modules/stock-alerts/module.yaml` via `npm run regenerate`. All structural changes (new jobs, schedule tweaks, summary text) must go through the YAML source.
- The `as const` modifier means the object is fully literal-typed; adding or removing keys at runtime is impossible—changes require a regeneration.
