---
source: shared/rules/jobs.yaml
source_sha256: 3b4241b7e65377e494141c8f52a810db20bb9b0ea5b77f657916d5ee35d49ca5
context_sha256: f2d9702680669be13175c07f5ab3ff9d994549305f71f1bf8e2e01ea001d7037
generated_at: 2026-11-22T02:26:10.288860+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/jobs.yaml

## Purpose
Declares the kernel's own scheduled jobs as data, covering those that belong to no module. A module's jobs live in its own `module.yaml` under `jobs:`, using the same fields. The file is not read at boot. `npm run regenerate` reads it to write the generated jobs TypeScript module, and it combines it with the module jobs to write `docker/crontab`.

## Key elements
Each entry under `jobs:` is keyed by the handle the generated TypeScript exports it under. By convention this is the camelCase of its `name`. Each entry has `name`, `schedule` (cron, UTC) and `summary`.

- `reapQuarantine` (`reap:quarantine`, `0 2 * * *`): deletes quarantined upload files past their retention window.
- `reapOrphanedImages` (`reap:orphaned-images`, `3 2 * * *`): deletes a stored image or thumbnail that no document names, once it is over an hour old.
- `reapMailSpool` (`reap:mail-spool`, `30 2 * * *`): deletes a spooled email attachment older than its retention window, left behind when a mail job died mid-flight.
- `sweepOutbox` (`sweep:outbox`, `* * * * *`): runs every minute and publishes every due outbox event. It is the backstop for the writer's own after-commit nudge, so it only carries events that a crash or a retry backoff left behind.

## Relationships
- `shared/rules/outbox.yaml`: `sweepOutbox` is the outbox's backstop relay. It publishes the events that the outbox rules describe, and it covers the ones the writer's after-commit nudge did not deliver.

## Notes
- Only name, schedule and summary live here. What each job runs, its lease and what it needs booted stay in code, in `src/app/jobs.ts`.
- Edit this file, then run `npm run regenerate`. The generated outputs (the jobs TypeScript module and `docker/crontab`) should not be edited by hand.
- The schedules are in UTC. The three reap jobs are staggered across 02:00 to 02:30.
