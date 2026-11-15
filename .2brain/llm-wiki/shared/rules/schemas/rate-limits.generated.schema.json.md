---
source: shared/rules/schemas/rate-limits.generated.schema.json
sha256: ccc20dc321237a7e51200c9a1f13c1a184712a37425b2f31d718275e5fb36ba4
generated_at: 2026-11-08T03:11:24.545671+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/rate-limits.generated.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates a top-level `rateLimits` configuration object. It enforces the shape of every individual rate-limit rule so that any consumer reading the config can rely on a consistent, closed set of fields.

## Key elements

- **`rateLimits`** – Required top-level object. Its keys are arbitrary strings (limiter identifiers); each value must match the per-rule schema below. No extra top-level keys are permitted.
- **Per-rule object** (the `additionalProperties` sub-schema):
  - `name` – Human-readable label; non-empty string.
  - `namespace` – Lowercase kebab-case identifier (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`).
  - `environmentVariable` – The env var that overrides the limit at runtime; must match `^NODE_[A-Z0-9_]+$`.
  - `defaultMax` – Positive integer (≤ `Number.MAX_SAFE_INTEGER`).
  - `windowMs` – Either the literal string `"shared"` (meaning the limiter shares a global window) **or** a positive integer (millisecond window).
  - `bounds` – Non-empty string (semantics defined outside the schema).
  - `audited` – Boolean flag indicating whether violations are logged/audited.
  - `onStoreError` – *(optional)* Enum `"memory"` or `"pass"`; controls fallback behavior when the rate-limit store is unavailable.
- **Required fields** (per rule): `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs`, `bounds`, `audited`. `onStoreError` is optional.
- **Closed shapes** – `additionalProperties: false` at both the top level and per-rule, so unknown keys fail validation.

## Relationships

No dependency-graph neighbors are recorded for this file. It is a standalone schema artifact; other modules would reference it by path or import it in a validation step.

## Notes

- `windowMs` is intentionally a union type: the string `"shared"` is a sentinel, not a numeric window. Consumers must branch on type.
- The `environmentVariable` pattern is prefixed `NODE_`, tying this schema to a Node.js runtime convention; it is not a generic env-var name.
- `defaultMax` upper bound is `Number.MAX_SAFE_INTEGER` (9007199254740991), not `Number.MAX_VALUE`, to keep values safe for JS arithmetic.
- Because `additionalProperties` is `false` at the rule level, adding a new field requires updating **both** this schema and any code that consumes the config.
