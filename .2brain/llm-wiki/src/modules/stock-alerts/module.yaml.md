---
source: src/modules/stock-alerts/module.yaml
sha256: 3eb46d930e45f496ee939667ca120bbcd9c9a866b1c2936f2f75bbbdcaea22ce
generated_at: 2026-11-08T08:28:55.469821+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/module.yaml

## Purpose

Module manifest for the **stock-alerts** feature (a buyer asks to be notified once when an unorderable product becomes orderable again). It declares the module's identity, subdomain classification, upstream dependencies, audit policy, and the single scheduled job that fulfils waiting alerts.

## Key elements

- **`summary`** — one-sentence description of the feature shown in module listings.
- **`subdomain: supporting` / `group: shop`** — classifies the module under the shop group, supporting subdomain.
- **`dependsOn`** — declares hard dependencies on `products` (the product announces when it is orderable again) and `users` (the email goes to the account's own address/language), each with an inline comment explaining the coupling.
- **`noAudit`** — justification string explaining why this module skips audit logging (no money, stock, or identity changes).
- **`jobs.sweepStockAlerts`** — the only job in the module:
  - `name`: `sweep:stock-alerts`
  - `schedule`: `35 * * * *` (minute 35 of every hour)
  - `summary`: answers waiting requests for products that became orderable without an explicit write event (e.g. a passed preorder release date); idempotent because answered requests are deleted.

## Relationships

- **`module.ts`** — the TypeScript implementation that this YAML manifests; the module file declares identity and dependencies, while `module.ts` provides the runtime logic (handlers, the sweep job body).
- **`openapi.yaml`** — the OpenAPI spec for the buyer-facing endpoints (create / clear a stock alert); `module.yaml` supplies the module-level context (group, subdomain, dependencies) that the API routes belong to.

## Notes

- `noAudit` is a **justification string**, not a boolean flag. It documents *why* audit is omitted; the absence of an `audit` key elsewhere is what actually suppresses it.
- The job relies on a **polling model** (hourly sweep) rather than event-driven triggers, because some stock changes (e.g. a release date passing) produce no write event to hook onto.
- The inline `#` comments in `dependsOn` and in the job block are load-bearing documentation—read them when adding or removing a dependency.
