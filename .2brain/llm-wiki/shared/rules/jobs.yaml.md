---
source: shared/rules/jobs.yaml
sha256: 3b4241b7e65377e494141c8f52a810db20bb9b0ea5b77f657916d5ee35d49ca5
generated_at: 2026-11-08T03:09:32.888797+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/jobs.yaml

## Purpose

Declarative definition of the kernel-level scheduled jobs that belong to no specific module. It is the single source of truth for *which* jobs exist, their cron schedules, and their human-readable summaries. It is not read at runtime; it feeds the `npm run regenerate` step that emits `src/app/jobs.generated.ts` and `docker/crontab`.

## Key elements

- **`jobs` map** – Top-level key. Each entry is keyed by the camelCase export handle (derived from the `name` field) and contains:
  - `name` – Dotted job identifier (e.g. `reap:quarantine`).
  - `schedule` – Cron expression, interpreted as **UTC**.
  - `summary` – One-line human description of what the job does.
- **`reapQuarantine`** – 02:00 UTC daily. Deletes quarantined upload files past their retention window.
- **`reapOrphanedImages`** – 02:03 UTC daily. Deletes stored images/thumbnails no document references, once over one hour old.
- **`reapMailSpool`** – 02:30 UTC daily. Deletes spooled email attachments older than the retention window (mail job died mid-flight).
- **`sweepOutbox`** – Every minute. Publishes every due outbox event; acts as the backstop relay when the writer's after-commit nudge was lost to a crash or retry backoff.

## Relationships

- **`shared/rules/outbox.yaml`** – `sweepOutbox` is the scheduled backstop for the outbox subsystem defined there. The outbox writer nudges after commit; this job picks up whatever a crash or backoff left behind.
- **`shared/rules/metrics.yaml`** – Shares the `shared/rules/` directory convention; module-owned jobs and their metrics are declared alongside their module's `module.yaml`. This file is the kernel-level analogue for jobs that have no owning module.

## Notes

- **Not loaded at boot.** The runtime job definitions (what each job actually executes, its lease, boot prerequisites) live in `src/app/jobs.ts`. This file only carries the *schedule* and *identity* metadata.
- **Keying convention.** The YAML key must be the camelCase form of `name` (e.g. `name: reap:quarantine` → key `reapQuarantine`). The generated TypeScript export uses that key.
- **All cron is UTC.** No local-timezone interpretation.
- **Module jobs are separate.** A module's own jobs sit under `jobs:` in its `module.yaml` with the same fields. They are also folded into `docker/crontab` during regeneration.
- **Regeneration is the only write path.** Never hand-edit `src/app/jobs.generated.ts` or `docker/crontab`; run `npm run regenerate`.
