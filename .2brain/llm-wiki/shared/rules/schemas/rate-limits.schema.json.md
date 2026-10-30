---
source: shared/rules/schemas/rate-limits.schema.json
sha256: ccc20dc321237a7e51200c9a1f13c1a184712a37425b2f31d718275e5fb36ba4
generated_at: 2026-10-29T01:48:58.259776+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/rate-limits.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the shape of a rate-limit configuration file. It enforces a single top-level `rateLimits` object whose entries each declare a named limiter with a namespace, the env-var that overrides its cap, a default max, a time window, bound type, audit flag, and an optional store-error fallback.

## Key elements

- **`rateLimits`** (required) — Map of arbitrary string keys → limiter definitions. No extra top-level keys allowed.
- **Per-entry required fields:** `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs`, `bounds`, `audited`.
- **`namespace`** — Must match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (lowercase kebab-case).
- **`environmentVariable`** — Must match `^NODE_[A-Z0-9_]+$`, tying each limiter to a specific env-var.
- **`defaultMax`** — Positive integer, capped at `Number.MAX_SAFE_INTEGER`.
- **`windowMs`** — Either the literal string `"shared"` (meaning the limiter shares a common window) or a positive integer (milliseconds).
- **`bounds`** — Non-empty string identifying the bound type.
- **`audited`** — Boolean flag.
- **`onStoreError`** *(optional)* — Enum `"memory"` | `"pass"`; controls fallback behavior when the backing store fails.
- **`additionalProperties: false`** at both levels — any unknown field is a validation error.

## Relationships

No dependency-graph neighbors were recorded for this file.

## Notes

- `windowMs` accepting the sentinel string `"shared"` is a deliberate escape hatch; code consuming this config must branch on that value rather than treating every entry as a millisecond integer.
- The `environmentVariable` pattern hardcodes the `NODE_` prefix, so new env-vars outside that convention will fail validation.
- Because `additionalProperties` is `false` at every level, adding a new field to a limiter definition requires updating this schema first.
