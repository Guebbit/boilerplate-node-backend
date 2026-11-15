---
source: src/modules/stock-alerts/module.yaml
sha256: 1d1ea83ee037e5b526ab2908a355a55219977f8215a9fd0be1250da8ae5671d2
generated_at: 2026-11-14T22:03:45.534789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/module.yaml

## Purpose

Module manifest for the back-in-stock alerts feature. It declares the module's identity, organizational placement, dependencies, and the single scheduled job that fulfils waiting alerts, so the platform runner can register the module without inspecting implementation code.

## Key elements

- **`summary` / `subdomain` / `group`** — Identifies the module as a *supporting* feature in the *shop* group; one-sentence description of the buyer-facing flow.
- **`dependsOn`** — Declares soft dependencies on `products` (the alert names a product; the product signals when it becomes orderable) and `users` (the notification email is sent to the account's own address and language).
- **`jobs.sweepStockAlerts`** — The sole job. Schedule `35 * * * *` (minute 35 of every hour). Answers alerts for products that are now orderable again *without* a write event to hook onto (e.g., a preorder whose release date has passed). Idempotent: answered requests are deleted, so re-running the sweep is safe.

## Relationships

- **`src/modules/stock-alerts/module.ts`** — The TypeScript implementation that the runner loads when this YAML registers the `sweepStockAlerts` job. The YAML names the job; the `.ts` file contains the logic.
- **`src/modules/stock-alerts/openapi.yaml`** — The OpenAPI spec for the module's HTTP endpoints (submit an alert, cancel an alert, etc.). The YAML manifest does not define endpoints; it complements them by declaring the non-HTTP, schedule-driven side of the module.

## Notes

- The `dependsOn` entries are annotated with *why* the dependency exists (product signals availability; user provides email/language). These are informational comments, not enforced imports.
- The job is deliberately scheduled rather than event-driven: the "release date passed" case produces no write to subscribe to, so a periodic sweep is the mechanism.
- Idempotency is achieved by deleting answered records, not by marking them done.
