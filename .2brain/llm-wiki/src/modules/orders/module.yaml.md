---
source: src/modules/orders/module.yaml
source_sha256: 72d1a8c65e5d79a9ef4c4cec56b7c5d00be1d614c31891ec3777ca4b3dead306
context_sha256: 4266bfa4ff2ebbb2efc0d89757c425e998fb00586efd76d2324ef5f5fb496fa0
generated_at: 2026-11-22T06:16:06.045174+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/module.yaml

## Purpose
Declarative manifest for the `orders` module. It describes what a checkout produces (status machine, totals, invoice link), assigns the module to the `core` subdomain and `shop` group, and declares its module dependencies, rate limits and scheduled jobs.

## Key elements
- **`summary`**: "What a checkout produces: its status machine, its totals and its invoice link."
- **`subdomain` / `group`**: `core` / `shop`.
- **`dependsOn`**: modules this one relies on, each annotated with why:
  - `access`: the audit flag of a cancel on the caller's own order (`ownOrderFlag`).
  - `account`: `operatorIdentity`, and the `termsVersion` an order freezes.
  - `inventory`: holds, commits, ships and releases its units.
  - `products`: a line copies the catalogue row's fields at purchase time.
  - `shop`: the currency a total is frozen in, and the seller on its emails.
  - `users`: a buyer's stored locale for emails; its hard delete runs the erase hook.
- **`rateLimits.ordersExport`**: "Order CSV exports", namespace `orders-export`, env var `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`, default max 10, shared window. Bounds `GET /orders/export`, keyed on the account. Audited.
- **`rateLimits.ordersNote`**: "Order staff notes", namespace `orders-note`, env var `NODE_ORDER_NOTE_RATE_LIMIT_MAX`, default max 30, shared window. Bounds `POST /orders/{id}/timeline/notes`, keyed on the account. Audited.
- **`jobs.reapOrders`**: `reap:orders`, runs on cron `10 2 * * *`. Anonymizes an order's remaining PII once its retention window has passed, and unsets a timeline row's staff text once its own window has.

## Relationships
- `src/modules/orders/module.ts` is the sibling module file. This manifest declares the module's metadata, limits and job, while the implementation lives alongside it. The content here does not show how the two are wired together.

## Notes
- Both rate limits are keyed on the account rather than the address. The export's step-up already makes the caller a person, and an address-keyed budget would let one manager behind a shared address starve others.
- The note limit is set well above a person logging calls and well below a script filling a customer's file. Each note writes a row that outlives the window and goes into the buyer's data export.
- `windowMs: shared` means the window is not set per limit in this file.
- Both limits are marked `audited: true`.
