---
source: src/modules/returns/jobs.generated.ts
sha256: b92f9fe8f8b6f33374fac78fbcbe41b501caa7909f035695a369a7047670f6ed
generated_at: 2026-10-29T05:39:06.810310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/jobs.generated.ts

## Purpose

Machine-generated data module that describes the returns module's scheduled jobs (name, cron schedule, summary) as a frozen object. It is produced from `src/modules/returns/module.yaml` so that job metadata lives in one declarative source while the executable wiring lives elsewhere.

## Key elements

- **`returnsJobData`** — `as const` object exporting the single job definition `reapReturns`:
  - `name`: `'reap:returns'`
  - `schedule`: `'12 2 * * *'` (cron: 2:12 AM daily)
  - `summary`: human-readable description of what the job does (clears `note` / `declineMessage` after a retention window)

## Relationships

- **`src/modules/returns/jobs.ts`** — Imports `returnsJobData` to obtain job metadata and supplies the actual handler/execution logic for each listed job. The split keeps *what* a job is (this file, YAML-driven) separate from *how* it runs (the hand-written `jobs.ts`).

## Notes

- **Do not edit directly.** The header explicitly states the file is regenerated via `npm run regenerate`; any change should be made in `src/modules/returns/module.yaml`.
- The `as const` assertion means the object is deeply readonly at the type level — do not expect runtime mutability.
- Currently contains only one job entry; adding a new job means editing the YAML and regenerating, not appending a new key here.
