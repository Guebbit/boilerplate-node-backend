---
source: src/modules/delivery/config.ts
sha256: a6547f4f1d95c20a92d26ce2223d9a4e38aa156ba8627a2db5d0d67a5e8b6a53
generated_at: 2026-11-08T05:26:06.098237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/config.ts

## Purpose

Declares the delivery module's single configuration value — the retention window for a staff's free-text hold note — and exposes a typed getter. It follows the read-per-call pattern (rather than a cached constant) so tests can vary the value case by case.

## Key elements

- **`deliveryConfig`** — The `defineConfig` instance for the `delivery` module. Defines one shape field: `NODE_HOLD_NOTE_RETENTION_DAYS` (integer, default 365, min 1).
- **`holdNoteRetentionDays()`** — Zero-arg getter that reads the config and returns the retention in days. Callers use this instead of touching `deliveryConfig` directly.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory used to build the module's config object.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor (type, `default`, `min` constraints).
- **`src/modules/delivery/services/retention.ts`** — Consumes `holdNoteRetentionDays()` to determine when `reap:delivery` should unset a stale `holdNote`.
- **`src/modules/delivery/module.ts`** — Registers `deliveryConfig` with the module so it is picked up by the application's config loading.

## Notes

- The value is read on every call to `holdNoteRetentionDays()` (not snapshotted at import time), which is the convention established by `returns/config.ts`. This is intentional: it lets tests inject per-case values without mutation of a module-level constant.
- `min: 1` means a retention of 0 is rejected at config-parse time; the smallest valid window is one day.
