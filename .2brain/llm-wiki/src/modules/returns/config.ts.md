---
source: src/modules/returns/config.ts
sha256: 454803a8c6495db97793eaede465a1d2d9dc083fbcd1b9afc0c1e43873c402b1
generated_at: 2026-10-15T11:50:59.587093+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/config.ts

## Purpose

Defines the retention window (in days) for free-text fields (`note`, `declineReason`) on returns. The value is read per call rather than captured at module load, following the same pattern as `orders/config.ts`, so individual tests can vary it.

## Key elements

- **`returnsConfig`** — A `defineConfig` instance named `'returns'` exposing a single field `NODE_RETURN_TEXT_RETENTION_DAYS` (integer, default **1095** days / 3 years, min 1).
- **`returnTextRetentionDays()`** — A zero-arg getter that calls `returnsConfig()` on each invocation and returns the current retention value in days.

## Relationships

- **`src/infrastructure/config/define.ts`** — Source of `defineConfig`, which `returnsConfig` uses to declare its shape.
- **`src/infrastructure/config/fields.ts`** — Source of the `int` field builder that constrains `NODE_RETURN_TEXT_RETENTION_DAYS`.
- **`src/modules/returns/module.ts`** — Module entry point that wires returns services together; depends on this config for the retention constant.
- **`src/modules/returns/services/retention.ts`** — Consumes `returnTextRetentionDays()` to determine when `reap:returns` unsets free-text fields.

## Notes

- The default of **1095** equals exactly three years (3 × 365); it is not a round number like 365 or 730.
- Because `returnTextRetentionDays()` re-reads the config on every call, changing the value at runtime (e.g. in a test) takes effect immediately without re-importing.
- Only free-text columns are affected; other return fields are not governed by this setting.
