---
source: src/modules/delivery/jobs.generated.ts
sha256: 68d63955666544d6662e149832b41313120bcf69f501b553e2d2210a6045f2e3
generated_at: 2026-10-29T03:34:53.355604+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/jobs.generated.ts

## Purpose

Auto-generated data file that declares delivery scheduled-job metadata (name, cron schedule, human-readable summary) as a typed constant. It exists so that job definitions live in a single YAML source (`module.yaml`) and are emitted here by `npm run regenerate`, keeping the data separate from the execution logic that lives in `jobs.ts`.

## Key elements

- **`deliveryJobData`** (exported `const`) — A frozen (`as const`) object mapping job keys to `{ name, schedule, summary }` records.
  - `reapDelivery` — cron `11 2 * * *`; clears hold/loss notes after a retention window.
  - `sweepPreorders` — cron `20 2 * * *`; notifies a buyer once when a preorder's expected date is imminent or past.

## Relationships

- **`src/modules/delivery/jobs.ts`** — Imports `deliveryJobData` to pair each data record with its actual execution logic. This file supplies *what* and *when*; `jobs.ts` supplies *how*.

## Notes

- **Do not edit by hand.** The banner comment states the file is regenerated from `module.yaml`; edit the YAML and run `npm run regenerate` instead.
- The `as const` modifier means the object is deeply readonly; treat keys and values as literals.
- The two cron times (11:02 and 20:02) are intentionally offset; changing them requires a YAML edit, not a code edit.
