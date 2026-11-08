---
source: src/modules/delivery/module.yaml
sha256: 8b902ce423d10f073bb592e2ec01413b263986574123646dcbad294f429f3480
generated_at: 2026-11-08T05:31:30.569808+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/module.yaml

## Purpose

Declarative module definition for the **delivery** subdomain (group: `shop`). It scopes the delivery domain — shipping-rate rules, fulfillment orders, staff shipment operations (cut, arrive, lost, hold/release), and late-preorder buyer notifications — and declares the module's cross-module dependencies and two scheduled background jobs.

## Key elements

- **`summary`** — One-line scope statement for the whole delivery subdomain.
- **`subdomain: supporting` / `group: shop`** — Categorisation used by the module registry.
- **`dependsOn`** — Ordered list of modules this one relies on:
  - `inventory` — stock-allocation events that release held fulfillment orders.
  - `orders` — the order a fulfillment order / shipment belongs to.
  - `products` — moved-release-date events and the date values staff previews read.
  - `shop` — the currency in which shipping rates are quoted.
- **`jobs.reapDelivery`** — Cron `11 2 * * *`. Unsets a fulfillment-order hold note and a shipment loss note once each has been unchanged for its retention window.
- **`jobs.sweepPreorders`** — Cron `20 2 * * *`. Idempotent daily sweep: notifies (exactly once) buyers of preorders whose expected date is within a day or already passed while goods are still outstanding. It neither asks for input nor cancels anything.

## Relationships

- **`src/modules/delivery/module.ts`** — TypeScript implementation this YAML configures (module metadata, job registration, API wiring).
- **`src/modules/delivery/openapi.yaml`** — The OpenAPI contract for delivery's REST endpoints; this file's `summary` and `dependsOn` are the higher-level metadata that sits alongside it.
- **`src/modules/inventory/module.ts` · `openapi.yaml`** — Source of the stock-allocation event that `reapDelivery` / hold-release logic reacts to.
- **`src/modules/orders/module.yaml` · `openapi.yaml` · `asyncapi.webhooks.yaml` · `authorization.yaml`** — The order entity that fulfillment orders and shipments reference; order webhooks and auth rules the delivery operations build on.
- **`src/modules/products/module.yaml`** — Release-date values and moved-date events that `sweepPreorders` and staff previews consume.

## Notes

- `reapDelivery` and `sweepPreorders` both run in the 2:00–2:20 AM window but are independent; the sweep is explicitly documented as idempotent, while the reap is a retention-window cleanup (no stated idempotency guarantee).
- The `shop` dependency is not represented by a file in the local graph (no `src/modules/shop/` neighbor listed); it is a logical/currency dependency only.
- Job `name` fields (`reap:delivery`, `sweep:preorders`) follow a `verb:noun` convention distinct from the camelCase YAML keys — these are the identifiers the scheduler actually matches.
