---
source: src/modules/delivery/config.ts
sha256: a6547f4f1d95c20a92d26ce2223d9a4e38aa156ba8627a2db5d0d67a5e8b6a53
generated_at: 2026-10-15T10:26:28.050471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/config.ts

## Purpose

Defines the single tunable setting for the `delivery` module — the retention window (in days) for a hold note attached to a fulfillment order. Exists so the value is centralised, validated, and readable on every call (rather than captured once at import time), enabling tests to vary it per case.

## Key elements

- **`deliveryConfig`** – The config object built via `defineConfig`. Exposes one shape field:
  - `NODE_HOLD_NOTE_RETENTION_DAYS` – integer, default 365, minimum 1.
- **`holdNoteRetentionDays()`** – Read-per-call accessor that returns the current value in days. Consumed by the `reap:delivery` job to decide when to unset `holdNote` on a fulfillment order.

## Relationships

- **`src/infrastructure/config/define.ts`** – Provides `defineConfig`, the factory used to build the validated config object.
- **`src/infrastructure/config/fields.ts`** – Provides the `int` field descriptor used to declare the `NODE_HOLD_NOTE_RETENTION_DAYS` shape (type, default, min).
- **`src/modules/delivery/module.ts`** – Registers or imports this config as part of the delivery module's public surface.
- **`src/modules/delivery/services/retention.ts`** – Calls `holdNoteRetentionDays()` to obtain the current threshold when reaping stale hold notes.

## Notes

- The "read per call" pattern (not a one-time snapshot) is intentional and mirrors the convention established in `returns/config.ts`. Do not refactor to a module-level constant; tests rely on mutating the config between cases.
- The config contains exactly one field by design — the module holds only one piece of free text (the hold note). Adding more fields here would be a scope change, not a config tweak.
- See `docs/modules/delivery.md#configuration` and `docs/theory/data-retention.md#free-text-on-holds` for the rationale behind the 365-day default.
