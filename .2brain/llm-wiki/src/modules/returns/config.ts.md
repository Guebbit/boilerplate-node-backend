---
source: src/modules/returns/config.ts
sha256: 05e9ebd82f8af2bce87efbb9b3073fde6d922ef68f90aabb2a47136845c288e6
generated_at: 2026-10-29T05:35:44.145388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/config.ts

## Purpose

Defines the retention window (in days) for free-text fields on returns. Follows the same per-call read pattern as `orders/config.ts`, so individual tests can override the value without mutating module state.

## Key elements

- **`returnsConfig`** — A `defineConfig` object (name: `'returns'`) with a single shape key:
  - `NODE_RETURN_TEXT_RETENTION_DAYS` — `int` field, default **1095** (3 years), minimum **1**.
- **`returnTextRetentionDays()`** — Getter that calls `returnsConfig()` and returns the current `NODE_RETURN_TEXT_RETENTION_DAYS` value. Calling it per-site (rather than caching at import) is what makes per-test override possible.

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies `defineConfig`, the factory that builds the typed config object.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field descriptor (validation: `default`, `min`).
- **`src/modules/returns/module.ts`** — Registers/exposes this config to the broader module surface.
- **`src/modules/returns/services/retention.ts`** — Calls `returnTextRetentionDays()` to determine when `reap:returns` should unset a return's `note` and `declineMessage`.

## Notes

- The value is intentionally read **at call time** (`returnsConfig()` inside the getter), not captured once at import. Changing the config in a test fixture will be picked up by subsequent calls without a re-import.
- `min: 1` means a retention of 0 is rejected by validation; there is no "disable retention" escape hatch through this field.
