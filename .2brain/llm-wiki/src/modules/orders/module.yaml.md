---
source: src/modules/orders/module.yaml
sha256: 72d1a8c65e5d79a9ef4c4cec56b7c5d00be1d614c31891ec3777ca4b3dead306
generated_at: 2026-11-14T20:39:05.849665+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.yaml

## Purpose

Module manifest for the **orders** subdomain (group `shop`). It declares what a checkout produces (status machine, totals, invoice link), the modules it depends on with a one-line note on *why*, the rate-limit budgets that guard two sensitive endpoints, and the single scheduled job that handles PII retention.

## Key elements

- **`dependsOn`** – Six modules (access, account, inventory, products, shop, users). Each entry carries an inline comment naming the *specific* field or behavior the order module consumes (e.g. `access` for the `ownOrderFlag` audit bit on self-cancels, `inventory` for hold → commit → ship → release).
- **`rateLimits.ordersExport`** – Budget of 10 CSV exports (`GET /orders/export`) per shared window, keyed on **ACCOUNT**. Overridable via `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`. Audited.
- **`rateLimits.ordersNote`** – Budget of 30 staff timeline notes (`POST /orders/{id}/timeline/notes`) per shared window, keyed on **ACCOUNT**. Overridable via `NODE_ORDER_NOTE_RATE_LIMIT_MAX`. Audited.
- **`jobs.reapOrders`** – Cron `10 2 * * *`. Anonymizes a buyer's remaining PII after the order retention window and independently unsets a timeline row's staff text after *that row's* own window.

## Relationships

- **`src/modules/orders/openapi.yaml`** / **`src/modules/orders/asyncapi.webhooks.yaml`** – Sibling API specs (REST / webhook) that this module manifest governs; the rate-limit `bounds` comments reference the concrete endpoints defined in those specs.
- **`src/modules/delivery/module.yaml`** – Listed as a graph neighbor but no direct reference or interaction is visible in this file.

## Notes

- Rate-limit keys are deliberately **ACCOUNT**, not buyer, order, or shipping address. The `bounds` comments explain the reasoning: an address-keyed budget would let a single manager behind a shared address starve every other caller; an order-keyed budget would let a script fan out.
- `windowMs: shared` is the convention here—both limits share the platform's global window rather than defining their own.
- `reapOrders` applies **two independent retention windows** (order-level PII vs. individual timeline-row staff text); they are not the same clock.
- The `dependsOn` inline comments are load-bearing documentation: they record *which field* is consumed, not just that a dependency exists. Treat them as the contract between the two modules.
