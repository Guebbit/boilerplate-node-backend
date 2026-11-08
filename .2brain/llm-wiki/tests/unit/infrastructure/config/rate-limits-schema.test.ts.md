---
source: tests/unit/infrastructure/config/rate-limits-schema.test.ts
sha256: 4904355c5437e23a7adba5e22bf1006d9a39e45e1c044354fd6478231e391a93
generated_at: 2026-11-08T10:11:55.074182+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/rate-limits-schema.test.ts

## Purpose

Unit tests that lock down the shape accepted by `rateLimitsBlockSchema`, ensuring each module's single YAML rate-limit block is validated correctly. Values (e.g. specific max numbers) are pinned elsewhere by per-module budget tests; this file only checks the schema's structural contract.

## Key elements

- **`entry`** — A single valid rate-limit record used as a baseline fixture. Each test mutates one field to verify the schema's rejection logic in isolation.
- **`describe('rateLimitsBlockSchema')`** — The suite covering five assertions:
  - Accepts an entry keyed by its camelCase namespace (`cartMerge`).
  - Rejects entries keyed by any other string.
  - Rejects unknown extra fields (behavior must live in code, not config).
  - Rejects non-positive-integer `defaultMax` values (`0`, `-1`, `1.5`).
  - Accepts `windowMs` as a number (ms) **or** the literal string `'shared'`; rejects other strings like `'hourly'`.

## Relationships

- **`src/infrastructure/config/shared-rules/rate-limits.ts`** — Sole import target. The test calls `rateLimitsBlockSchema.safeParse(…)` exclusively; no other exports from that module are exercised here.

## Notes

- The schema enforces strict key matching on the camelCase namespace — a common pitfall when adding a new module (e.g. `cartMerge` vs `cart-merge` vs `merge`).
- The "no unknown fields" rule means any new behavioral flag must be added to the schema in `rate-limits.ts` *before* it can appear in a budget block.
- `windowMs` is a union type (`number | 'shared'`); the literal string `'shared'` is the only permitted non-numeric value.
