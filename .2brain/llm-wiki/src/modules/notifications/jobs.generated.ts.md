---
source: src/modules/notifications/jobs.generated.ts
sha256: bd71377ceb13e1c6e4987a13b1143326e1bf0d66299277868910285a4f1f8a5c
generated_at: 2026-10-29T04:28:35.314731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/jobs.generated.ts

## Purpose

Auto-generated data definition for the notifications module's scheduled jobs. It is produced by `npm run regenerate` from `src/modules/notifications/module.yaml` and should never be edited by hand.

## Key elements

- **`notificationsJobData`** (exported `const`) — a frozen object mapping each job key to its `name` (cron job identifier), `schedule` (cron expression), and `summary` (human-readable description of what the job does).
  - `sweepStaffDigest` — cron `30 6 * * *`; rewrites and mails per-staff overdue summary rows.
  - `sweepStaffWeekly` — cron `30 6 * * 1`; rewrites and mails the late-preorder summary row for order-editing staff.

## Relationships

- **`src/modules/notifications/jobs.ts`** — consumes `notificationsJobData` to attach the actual handler/runner function to each job entry. The generated file supplies the metadata; `jobs.ts` supplies the executable behavior.

## Notes

- **Do not edit.** All changes belong in `src/modules/notifications/module.yaml`; run `npm run regenerate` to update this file.
- The `as const` assertion means the object and all its string values are deeply readonly at the type level.
