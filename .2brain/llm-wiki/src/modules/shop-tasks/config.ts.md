---
source: src/modules/shop-tasks/config.ts
sha256: 4497a75a2f7838cbedcedf4fe0f2393bf48e3281d0ac10e9fed6988379e8a5d4
generated_at: 2026-11-14T21:49:57.640478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/config.ts

## Purpose

Declares the configuration schema for the shop-tasks module's staff digest timing thresholds. Each knob controls how long a given workflow stage (transfer, hold, return, unshipped, tracking, undelivered) must elapse before the daily digest counts it as actionable.

## Key elements

- **`shopTasksConfig`** — the sole export; a `defineConfig` object named `'shop-tasks'` whose `shape` maps seven `int` fields (each with a `default` and a `min` bound) to their environment-variable-style names.
- **Fields** (all integer, non-negative):
  - `NODE_STAFF_TRANSFER_DUE_HOURS` (default 24, min 1)
  - `NODE_STAFF_HOLD_OPEN_DAYS` (default 3, min 1)
  - `NODE_STAFF_RETURN_DECISION_DAYS` (default 3, min 1)
  - `NODE_STAFF_RETURN_TRANSIT_DAYS` (default 7, min 0)
  - `NODE_STAFF_UNSHIPPED_DAYS` (default 3, min 1)
  - `NODE_STAFF_TRACKING_MISSING_HOURS` (default 24, min 1)
  - `NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS` (default 14, min 1)

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the factory that wraps the shape into a typed config object.
- **`src/infrastructure/config/fields.ts`** — provides the `int` field descriptor used to declare each knob's type, default, and minimum.
- **`src/modules/shop-tasks/module.ts`** — consumes `shopTasksConfig` to register it with the module.
- **`src/modules/shop-tasks/services/digest.ts`** — reads the resolved values to decide which items are due for the daily digest.

## Notes

- Unit is encoded in the field name suffix (`_HOURS` vs `_DAYS`); there is no shared unit metadata in the schema.
- Only `NODE_STAFF_RETURN_TRANSIT_DAYS` allows `0`; every other field enforces a minimum of `1`.
- The `NODE_DELIVERY_*` prefix breaks the otherwise uniform `NODE_STAFF_*` pattern — it refers to a delivery-level reminder rather than a staff workflow step.
