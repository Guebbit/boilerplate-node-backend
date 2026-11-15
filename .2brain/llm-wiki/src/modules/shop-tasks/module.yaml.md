---
source: src/modules/shop-tasks/module.yaml
sha256: a67872967020a4c1deda4fec28e89e9b9ce0b3a6a442d351959b8cca70d5b804
generated_at: 2026-11-14T21:51:12.954879+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/module.yaml

## Purpose

Declarative manifest for the **shop-tasks** module: it names the module's role (the shop's helpdesk side — opening to-dos, writing buyer/staff messages, sending the staff digest), lists every module it depends on, and registers two scheduled sweep jobs. It exists so the runtime and the dependency graph can discover what this module subscribes to and when it fires.

## Key elements

- **`summary` / `subdomain` / `group`** — Identity metadata: supporting subdomain, `shop` group.
- **`dependsOn`** (15 entries) — The full set of modules this module reads from or subscribes to. Inline comments on each entry explain *why* the edge exists (event subscription, digest counting, entity naming).
- **`jobs.sweepStaffDigest`** (`sweep:staff-digest`, `30 6 * * *`) — Daily job that rewrites the staff summary rows (transfers due, unshipped, undecided returns, open holds, missing tracking codes, undelivered parcels, stale refunds, low stock) and mails each person their newly-appeared or grown overdue items.
- **`jobs.sweepStaffWeekly`** (`sweep:staff-weekly`, `30 6 * * 1`) — Monday job that rewrites the late-preorder row for order-editing staff and mails it when it appeared or grew.

## Relationships

- **`src/modules/shop-tasks/module.ts`** — The TypeScript implementation that consumes this manifest. The YAML declares *what* the module is and *when* its jobs run; the `.ts` file contains the event handlers and job logic.

## Notes

- The `dependsOn` list is the authoritative event-subscription and data-read surface. If a new upstream event is added, the corresponding entry (and its comment) must appear here or the dependency graph will miss the edge.
- Several dependencies are used **only** inside the digest count (e.g., `delivery` parcels, `inventory` low-stock, `payments` stale refunds, `returns` count, `orders` count). They are not event subscribers for to-do creation; the to-do-creation path is narrower (cart, delivery, inventory, payments refund/dispute, returns, stock-alerts, wishlist).
- `shop` and `users` are **read-only** lookups (country for delay-consent reminders; who can act for digest delivery) — they carry no events this module subscribes to.
- Both jobs fire at **06:30**; the weekly one additionally constrains to Monday. They are idempotent rewrites of summary rows, not one-shot triggers.
