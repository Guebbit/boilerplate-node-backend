---
source: src/modules/orders/module.yaml
sha256: 88312c9b3ae9088bbacb731b32da921ae3a194bcc157b527449201ec476dd2e0
generated_at: 2026-11-08T06:53:17.412994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.yaml

## Purpose

Module manifest for the **orders** subdomain (group `shop`, subdomain `core`). It declares the module's upstream dependencies, the rate-limit budgets that govern its write-heavy endpoints, and the single background job responsible for post-retention PII cleanup. It exists so that tooling, the rate-limiter, and the job scheduler can resolve orders-module policy without parsing code.

## Key elements

- **`summary`** — one-line description of what a checkout produces (status machine, totals, invoice link).
- **`subdomain` / `group`** — placement labels: `core` / `shop`.
- **`dependsOn`** — six upstream modules (`access`, `account`, `inventory`, `products`, `shop`, `users`), each annotated with a comment explaining *which* field or behaviour the order record pulls from that module.
- **`rateLimits.ordersExport`** — budget for `GET /orders/export` (CSV). Keyed on **ACCOUNT**, 10 per shared window, env-var override `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`, audited.
- **`rateLimits.ordersNote`** — budget for `POST /orders/{id}/timeline/notes`. Keyed on **ACCOUNT**, 30 per shared window, env-var override `NODE_ORDER_NOTE_RATE_LIMIT_MAX`, audited.
- **`jobs.reapOrders`** — cron `10 2 * * *` (daily at 02:10). Anonymises PII on orders past their retention window and clears staff-note text whose own window has lapsed.

## Relationships

- **`src/modules/orders/openapi.yaml`** — the two rate-limit entries reference specific paths defined there (`GET /orders/export`, `POST /orders/{id}/timeline/notes`); this file supplies the budget policy that middleware enforces against those routes.
- **`src/modules/delivery/module.yaml`** and **`src/modules/orders/asyncapi.webhooks.yaml`** — no direct reference or interaction visible in this file.

## Notes

- **`windowMs: shared`** is a string, not a millisecond count. It signals that the window is shared across all orders endpoints (or across the whole process) rather than scoped per-route; the concrete duration is resolved elsewhere.
- **`bounds`** is free-form prose, not a structured object. The rationale is deliberately human-readable (explaining *why* the key is ACCOUNT and *why* the cap sits where it does).
- **`dependsOn` comments** are the authoritative "why" for each dependency — e.g. `users` is listed because of the erase-hook on hard-delete, not merely because the buyer's locale is stored there. Removing a dependency without checking its comment risks dropping an unobvious coupling.
- The `reapOrders` job is the **only** writer that mutates order PII after creation; there is no corresponding "restore" job in this manifest.
