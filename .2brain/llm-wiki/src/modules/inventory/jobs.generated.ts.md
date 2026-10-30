---
source: src/modules/inventory/jobs.generated.ts
sha256: f1fb91572919d20d04089f743eee25b2769deec960c78f8fd93a24f58c8e5134
generated_at: 2026-10-29T04:00:43.347521+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/jobs.generated.ts

## Purpose

Generated metadata file that declares inventory's scheduled jobs as static data (name, cron schedule, human-readable summary). It exists to decouple job *definitions* from job *implementations*: this file says **when** jobs run and **what** they are; `jobs.ts` says **how** they run. The file is regenerated from `module.yaml` and must not be edited by hand.

## Key elements

- **`inventoryJobData`** — `as const` object mapping job keys to `{ name, schedule, summary }` descriptors. Currently contains a single entry:
  - `sweepReservations` — cron `*/5 * * * *`; drains stale checkout holds in batches of 200 and cancels the order behind each.

## Relationships

- **`src/modules/inventory/jobs.ts`** (graph neighbor) — Imports `inventoryJobData` to drive its job registration loop. `jobs.ts` supplies the actual function bodies; this file supplies only the declarative schedule/name/summary metadata. Editing the YAML and re-running `npm run regenerate` updates this file, which in turn changes what `jobs.ts` schedules.

## Notes

- **Do not edit directly.** The header banner marks it as generated from `src/modules/inventory/module.yaml`. Make changes in the YAML, then run `npm run regenerate`.
- The `as const` assertion means the exported object is deeply readonly; consumers (e.g. `jobs.ts`) must treat it as a fixed lookup table.
- Adding a new job means adding an entry here (via the YAML) **and** a corresponding implementation in `jobs.ts`; the two files stay in lockstep by convention.
