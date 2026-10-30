---
source: src/modules/payments/rate-limits.generated.ts
sha256: 97f04319252132e10ab1a7a498dcf6d5dea9705cd5af7dc4b77b7c054ec0197c
generated_at: 2026-10-29T05:08:39.389090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/rate-limits.generated.ts

## Purpose

Generated data table that declares the rate-limit budgets (namespaces, defaults, windows, and descriptive bounds) for every payments endpoint. It exists as a build artifact so that the single source of truth remains the YAML definition in `module.yaml`, and so consumers get a typed, importable object without parsing YAML at runtime.

## Key elements

- **`paymentsRateLimitData`** (exported `const`) — A frozen object with five entries, each carrying:
  - `name` / `namespace` — human label and Redis-style key segment.
  - `environmentVariable` — `NODE_…_RATE_LIMIT_MAX` override for the default.
  - `defaultMax` — the fallback cap when the env var is unset.
  - `windowMs` — window size in milliseconds (one entry uses the string `'shared'` instead of a number, indicating a window managed elsewhere).
  - `bounds` — prose describing exactly which route/outcome the counter is spent on.
  - `audited` — whether the limiter is included in audit logging.

## Relationships

- **`src/modules/payments/rate-limits.ts`** — Imports `paymentsRateLimitData` and layers on the key-construction and skip-condition logic that turns the raw budget data into active rate-limit rules for the HTTP layer.

## Notes

- **Do not edit by hand.** Regenerate with `npm run regenerate` after changing `src/modules/payments/module.yaml`.
- `windowMs` is intentionally heterogeneous: `paymentWebhook` uses `'shared'` (its window is governed by the shared webhook-delivery window), while the other four use a 1-hour numeric window.
- `paymentsConfirmAttempts` and `paymentsConfirmDeclines` share the same route (`POST /payments/:id/confirm`) but count different events (every attempt vs. genuine declines only), and `paymentsConfirmDeclinesBlock` adds an IP-block dimension to catch card-testing spread across accounts.
