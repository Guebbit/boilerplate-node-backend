---
source: src/modules/stock-alerts/config.ts
sha256: 841da3e28502461bf8fcccbe1fa454d69e38315ca9e4df1b7934e296272a85c6
generated_at: 2026-11-14T22:02:38.590563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/config.ts

## Purpose

Defines the single tunable for the stock-alerts module: the maximum number of back-in-stock requests one account may hold simultaneously. This cap guarantees that `GET /stock-alerts` stays unpaginated.

## Key elements

- **`stockAlertsConfig`** – A `defineConfig` instance named `"stock-alerts"` with one shape field:
  - `NODE_STOCK_ALERTS_MAX` – `int` field, default `100`, range `1–250`. The hard ceiling of 250 is what keeps the endpoint effectively unpaginated regardless of operator input.
- **`stockAlertsMax()`** – Convenience getter that returns the current value of `NODE_STOCK_ALERTS_MAX` (a number between 1 and 250).

## Relationships

- **`@infrastructure/config/define`** (`src/infrastructure/config/define.ts`) – Provides `defineConfig`, the factory used to build `stockAlertsConfig`.
- **`@infrastructure/config/fields`** (`src/infrastructure/config/fields.ts`) – Provides the `int` field validator (default, min, max constraints).
- **`src/modules/stock-alerts/module.ts`** – Module entry point that registers/exposes the config and routes for stock alerts.
- **`src/modules/stock-alerts/repository.ts`** – Data-access layer that consumes `stockAlertsMax()` to enforce the per-account cap when creating or querying alerts.

## Notes

- The `max: 250` bound is intentional: it is the invariant that lets the API skip pagination logic. Raising it above 250 would break the "never paginated" guarantee documented in `docs/tools/configuration.md`.
- There is exactly **one** knob in this file by design. Do not add additional fields here without a corresponding change to the module's documented configuration surface.
