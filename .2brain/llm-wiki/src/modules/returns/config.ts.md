---
source: src/modules/returns/config.ts
sha256: 05e9ebd82f8af2bce87efbb9b3073fde6d922ef68f90aabb2a47136845c288e6
generated_at: 2026-11-08T07:55:40.368962+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/config.ts

## Purpose

Defines the retention window (in days) for free-text fields on returns. Follows the read-per-call pattern established by `orders/config.ts` so that tests can override the value case-by-case without mutating module state.

## Key elements

- **`returnsConfig`** (exported const) — The config object produced by `defineConfig`. Exposes one field: `NODE_RETURN_TEXT_RETENTION_DAYS` (`int`, default **1095**, min **1**).
- **`returnTextRetentionDays()`** (exported function) — Calls `returnsConfig()` and returns the `NODE_RETURN_TEXT_RETENTION_DAYS` value as a number. Intended for use by the `reap:returns` retention job.

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies `defineConfig`, the factory that builds the `returnsConfig` object with its validation shape.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field descriptor used to declare `NODE_RETURN_TEXT_RETENTION_DAYS` (type, default, minimum).
- **`src/modules/returns/services/retention.ts`** — Consumes `returnTextRetentionDays()` to determine whether a return's `note` / `declineMessage` should be unset.
- **`src/modules/returns/module.ts`** — The module entry point that wires together the returns module's services (including the retention service) and thus transitively depends on this config.

## Notes

- The value is read **per call** (`returnsConfig().NODE_…`), not captured at import time. This is deliberate: it lets a test swap the underlying config between assertions without re-importing.
- Default of 1095 days ≈ 3 years. The `min: 1` guard means the field can never be set to `0` or negative through the config layer.
- The JSDoc cross-references two docs paths (`docs/modules/returns.md#configuration`, `docs/theory/data-retention.md#free-text-on-returns`) as the canonical explanation of *why* the window exists; see those for policy context.
