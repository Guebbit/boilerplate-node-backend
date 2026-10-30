---
source: src/modules/orders/rate-limits.generated.ts
sha256: ce1716282389abe5be3acfd23dc87e54ebd8223c8e12768fc803d936bdf73a13
generated_at: 2026-10-29T04:44:15.119255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/rate-limits.generated.ts

## Purpose

Machine-generated data file that declares the rate-limit budgets for the orders module. It exists so that `rate-limits.ts` can consume the budgets as pure data (name, namespace, default max, window, etc.) while layering on keying and skip logic separately.

## Key elements

- **`ordersRateLimitData`** (`as const`) — A frozen record of rate-limit entries keyed by operation name. Currently contains one entry, `ordersExport`, defining the budget for `GET /orders/export` (namespace `orders-export`, default max 10, shared window, audited, keyed on account).

## Relationships

- **`src/modules/orders/rate-limits.ts`** — Imports `ordersRateLimitData` from this file and augments each entry with its keying strategy and skip logic to produce the runtime rate-limiters actually registered on the server.

## Notes

- **Generated file.** Produced by `npm run regenerate` from `src/modules/orders/module.yaml`. To change a budget value, edit the YAML and re-run the generator—do not hand-edit this file.
- The `bounds` string on each entry is a *documentation* field (explains the keying rationale), not a machine-parsed constraint. It is surfaced for human/AI readers only.
