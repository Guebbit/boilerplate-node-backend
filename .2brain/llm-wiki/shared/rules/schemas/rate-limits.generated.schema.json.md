---
source: shared/rules/schemas/rate-limits.generated.schema.json
source_sha256: ccc20dc321237a7e51200c9a1f13c1a184712a37425b2f31d718275e5fb36ba4
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:28:16.964366+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/rate-limits.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that validates a rate-limit configuration document. It defines the shape of a top-level `rateLimits` map in which each entry describes one named rate limiter (its namespace, env-var override, default max, window, and metadata).

## Key elements
- **`rateLimits`** (required, only allowed top-level key): an object with string keys; each value is a rate-limit entry. Extra top-level properties are rejected.
- **Entry fields** (all required unless noted; `additionalProperties: false`):
  - `name`: non-empty string.
  - `namespace`: kebab-case string, matching `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`.
  - `environmentVariable`: must match `^NODE_[A-Z0-9_]+$`.
  - `defaultMax`: positive integer, up to 9007199254740991.
  - `windowMs`: either the literal string `"shared"` or a positive integer (max 9007199254740991).
  - `bounds`: non-empty string.
  - `audited`: boolean.
  - `onStoreError` (optional): enum `"memory"` or `"pass"`.

## Relationships
No graph neighbors are listed, so no dependencies or consumers are visible from this file alone.

## Notes
- The `.generated` name indicates it is produced by tooling. Edit the source of truth, not this file; the source is not identified here.
- The `maximum: 9007199254740991` bounds and the `propertyNames`/`exclusiveMinimum` style are consistent with schema generation from a Zod-like definition. This is an inference, not stated in the file.
- `windowMs: "shared"` is a sentinel string. This file does not say what it refers to.
- The schema only validates structure and formats. It does not say what `bounds` contains or what `onStoreError` values do at runtime.
