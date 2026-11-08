---
source: src/modules/tasks/module.yaml
sha256: e162c4ed9db132fa6e205633d31b78e0824e57a7bdd51492d0911123cf8bc760
generated_at: 2026-11-08T08:35:14.196033+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/module.yaml

## Purpose

Module manifest for the **tasks** domain: declares the module's identity, its upstream dependencies, one scheduled sweep job, and three contact-submission rate limiters. It exists so the runtime can discover the module's metadata (group, subdomain, dependencies) and configure its non-request-facing concerns (cron schedule, rate limits) without parsing TypeScript.

## Key elements

- **`summary` / `subdomain` / `group`** — Module card: tasks are "situations someone must take and close," filed under `generic` subdomain in the `foundation` group.
- **`dependsOn`** — Three upstream modules with stated reasons:
  - `access` — determines which roles a task may be assigned to.
  - `account` — tasks subscribe to its events (data export failed / ready).
  - `users` — provides assignee display name, existence checks, and review-flag events.
- **`jobs.sweepTasksOverdue`** — Daily cron (`40 6 * * *`, i.e. 06:40). Notifies staff of an open task once at "3 days before due" and once after it passes due. Skips already-closed tasks; never re-sends a given alert.
- **`rateLimits`** — Three shared-window limiters, all `audited: true`, all consumed only on **success**:
  - `submissions` — per source address (default 5, env `NODE_SUBMISSION_RATE_LIMIT_MAX`).
  - `submissionIdentity` — per sender email (default 5, env `NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX`).
  - `submissionBlock` — per source address block (default 20, env `NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX`).

## Relationships

- **`src/modules/tasks/module.ts`** — The TypeScript implementation that this manifest describes. The manifest supplies the module's dependency list, job schedule, and rate-limit configuration that the code registers or consumes at startup.
- **`src/modules/tasks/openapi.yaml`** — The HTTP API surface for the same tasks module; the manifest governs what happens *around* those endpoints (rate limiting, scheduling), while the OpenAPI spec defines the endpoints themselves.

## Notes

- Rate limits are deliberately **success-only**: a malformed or rejected submission does not decrement the budget. The `bounds` strings spell this out for each limiter.
- All three limiters share the same `windowMs` value (`shared`), so they tick in lockstep despite different namespaces and maxima.
- The sweep job is a one-shot-per-threshold notification, not a recurring reminder: the "already told" guard means a task that is 3 days overdue gets exactly two messages total (pre-due, post-due).
