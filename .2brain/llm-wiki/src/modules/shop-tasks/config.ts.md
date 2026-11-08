---
source: src/modules/shop-tasks/config.ts
sha256: 1bed7274db3802cd8c1694e3b29f689d8e6622b1688174ec410d6b76a2705f1d
generated_at: 2026-11-08T08:14:05.007352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/config.ts

## Purpose

Defines the tunable thresholds (in hours or days) that control when shop items become eligible for the staff daily digest. It centralises these "knobs" so that the digest logic and any future consumers read from a single, validated source.

## Key elements

- **`shopTasksConfig`** (exported const) — The sole export. A config object created via `defineConfig` with name `"shop-tasks"` and a shape of six `int` fields, each with a positive integer default and a `min: 1` constraint:
  - `NODE_STAFF_TRANSFER_DUE_HOURS` (default 24)
  - `NODE_STAFF_HOLD_OPEN_DAYS` (default 3)
  - `NODE_STAFF_RETURN_DECISION_DAYS` (default 3)
  - `NODE_STAFF_UNSHIPPED_DAYS` (default 3)
  - `NODE_STAFF_TRACKING_MISSING_HOURS` (default 24)
  - `NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS` (default 14)

## Relationships

- **`@infrastructure/config/define`** — provides `defineConfig`, the factory used to build `shopTasksConfig`.
- **`@infrastructure/config/fields`** — provides the `int` field type used for every entry in the shape.
- **`module.ts` (same module)** — registers / re-exports this config as the module's configuration surface.
- **`services/digest.ts`** — consumes the threshold values to decide which items appear in the daily staff digest.

## Notes

- All fields are constrained to integers ≥ 1; there is no upper bound. If a downstream service reads a value it will always receive a positive integer (post-validation), not `undefined`.
- Units are mixed (hours vs. days) across fields — the suffix in the key name (`_HOURS` vs `_DAYS`) is the only indicator; consumers must not assume a uniform unit.
