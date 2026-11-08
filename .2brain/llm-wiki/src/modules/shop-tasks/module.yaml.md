---
source: src/modules/shop-tasks/module.yaml
sha256: 93adde2554a92a3b83d4e34ea6a21bfeb16cdfb6221bcaeeced5d16e07076d8e
generated_at: 2026-11-08T08:15:25.002855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/module.yaml

## Purpose

Declarative manifest for the shop-tasks module. It declares the module's role (opening to-do items for payment, stock, and delivery situations that require a human, writing buyer-facing messages and staff notices, and producing the staff digest), its upstream event subscriptions, and its two scheduled jobs. The actual logic lives in the sibling `module.ts`.

## Key elements

- **`summary`** — human-readable one-liner describing the module's responsibility.
- **`subdomain` / `group`** — classifies the module as `supporting` within the `shop` group.
- **`dependsOn`** — lists eleven upstream modules whose events this module subscribes to (`cart`, `delivery`, `inventory`, `orders`, `payments`, `returns`, `stock-alerts`, `wishlist`) or which it reads from (`notifications`, `shop`, `tasks`, `users`).
- **`noAudit`** — explicitly states this module owns no collection; it writes exclusively through `tasks` and `notifications`, which audit their own writes.
- **`jobs.sweepStaffDigest`** — daily job (`30 6 * * *`, `sweep:staff-digest`): rewrites the staff summary rows (transfers due, unshipped, undecided returns, open holds, missing tracking, undelivered parcels, stale refunds, low stock) and mails overdue items to the relevant staff.
- **`jobs.sweepStaffWeekly`** — Monday job (`30 6 * * 1`, `sweep:staff-weekly`): rewrites the late-preorder summary row for order-editing staff and mails it when it appeared or grew.

## Relationships

- **`src/modules/shop-tasks/module.ts`** — the implementation file. The YAML declares *what* the module is (identity, dependencies, scheduled jobs); the TS file contains *how* (event handlers, digest computation, message writing). The two files are read together.

## Notes

- **No own collection.** The `noAudit` field is a deliberate contract: do not expect a `shop-tasks` collection in the data layer. All persistence is delegated to `tasks` and `notifications`.
- **`shop` dependency** is not an event subscription but a data read (the shop's country), used to determine which staff owe a delay-consent reminder.
- **Digest counting** spans several upstream modules (`delivery`, `inventory`, `orders`, `payments`, `returns`, `wishlist`); the YAML comments on each `dependsOn` entry explain *why* that module is listed.
