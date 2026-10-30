---
source: src/modules/orders/module.yaml
sha256: 373073f91e845aab2a3beff76511bf1fd3223d559eb98d063108a9780441331e
generated_at: 2026-10-29T04:43:26.692563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.yaml

## Purpose

Module descriptor for the **orders** subdomain. It declares the module's metadata (subdomain, group), its upstream dependencies, one rate-limit policy, and one scheduled job. Sibling files (`module.ts`, `openapi.yaml`) carry the implementation and API contract; this file is the declarative contract consumed by the framework at load time.

## Key elements

- **`summary`** – One-line description of what an order represents: its status machine, frozen totals, and invoice link.
- **`subdomain` / `group`** – Classifies the module under `core` / `shop`.
- **`dependsOn`** – Five upstream modules, each with a comment explaining the *specific* data or side-effect borrowed:
  - `access` – `ownOrderFlag` audit flag on cancellations.
  - `inventory` – claim/release of unit reservations.
  - `products` – line-item snapshot of catalogue fields at purchase time.
  - `shop` – currency for frozen totals; seller identity for emails.
  - `users` – buyer locale for emails; hard-delete triggers an erase hook.
- **`rateLimits.ordersExport`** – 10-requests-per-`shared`-window limit on `GET /orders/export`, keyed on the **account** (not address), audited, tunable via `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`.
- **`jobs.reapOrders`** – Cron job (`10 2 * * *`) that anonymizes PII past its retention window and unsets expired staff notes on timeline rows.

## Relationships

- **`src/modules/orders/module.ts`** – The TypeScript entry point that this YAML describes; the framework reads `module.yaml` to wire dependencies, rate limits, and job registration before loading `module.ts`.
- **`src/modules/orders/openapi.yaml`** – Defines the HTTP endpoints (including `GET /orders/export`) that the `ordersExport` rate limit governs.
- **`src/modules/payments/module.ts`** – Referenced indirectly: the summary mentions an "invoice link" produced by a checkout, which the payments module owns.

## Notes

- The rate-limit budget is deliberately **account-keyed**, not address-keyed, so that multiple signed-in managers sharing one address cannot collectively exhaust each other's export quota. The step-up auth that precedes the export already guarantees a human caller.
- `windowMs: shared` means the window is a global/cluster-wide bucket rather than per-process; the `defaultMax` of 10 applies across all instances unless `NODE_ORDER_EXPORT_RATE_LIMIT_MAX` overrides it.
- The `reapOrders` job runs at **02:10 daily**; it handles two distinct retention windows (order PII vs. timeline staff text) in a single pass.
