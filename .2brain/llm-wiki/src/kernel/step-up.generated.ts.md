---
source: src/kernel/step-up.generated.ts
sha256: 1858aeebfdbe193450224fb1ba95930684822a47b5a867efd15affce9b62c6c8
generated_at: 2026-10-29T02:21:10.429283+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/step-up.generated.ts

## Purpose

Auto-generated lookup table of default step-up authentication freshness windows (in seconds) per tier. It exists so that tier-specific timeouts are defined in one typed source while remaining overridable by the environment.

## Key elements

- **`stepUpWindowData`** (exported const) — Readonly object mapping step-up tier names to their default sign-in freshness window in seconds:
  - `critical: 300`
  - `sensitive: 900`

  Typed with `as const`, so keys and values are literal and non-extensible.

## Relationships

- **`src/kernel/config.ts`** — Consumes `stepUpWindowData` as the fallback defaults; per the module doc-comment, the environment (managed through config) overrides each tier's value at runtime.

## Notes

- **Do not edit.** The file header marks it as GENERATED from `shared/authorization-keys.yaml` via `npm run regenerate`. To change a window value, edit the YAML and re-run the generation script.
- The `as const` modifier means the exported type is `{ critical: 300; sensitive: 900 }`, not `{ critical: number; sensitive: number }`. Downstream code comparing or indexing against it will see literal types.
