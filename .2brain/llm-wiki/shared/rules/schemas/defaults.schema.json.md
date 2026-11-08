---
source: shared/rules/schemas/defaults.schema.json
sha256: 6269ee07d5a6af20200f70afa52b2fab6a558894a7e4e1b9f2275cbfc4319ec0
generated_at: 2026-11-08T03:10:28.968826+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/defaults.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates a system-wide `defaults` configuration object. It enforces the exact shape and value bounds of five operational settings (response cache, idempotency, pagination, images, uploads) so that any consumer reading this config gets a predictable, fully-specified set of values.

## Key elements

- **Top-level object** – requires a single `defaults` key; nothing else is allowed at the root.
- **`defaults.responseCache`** – `devTtlMaxSeconds` (integer ≥ 0) and `maxBytes` (integer ≥ 1).
- **`defaults.idempotency`** – `retentionHours` (integer ≥ 1).
- **`defaults.pagination`** – `pageSize` (integer ≥ 1).
- **`defaults.images`** – `maxInputPixels`, `maxDimension`, `thumbnailDimension`, `quarantineRetentionHours` (all integers ≥ 1).
- **`defaults.uploads`** – `maxBytes` (integer ≥ 1).
- **`additionalProperties: false`** on every object node – closed schemas; any undeclared key causes a validation failure.
- **`maximum: 9007199254740991`** (Number.MAX_SAFE_INTEGER) as the universal upper bound for every integer field.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- `responseCache.devTtlMaxSeconds` uses `minimum: 0` (inclusive), while every other integer field uses `exclusiveMinimum: 0` (i.e. ≥ 1). The zero-value is intentional only for the dev TTL.
- Because every node is closed (`additionalProperties: false`), adding a new sub-setting requires editing this schema *and* any code that produces/consumes the config.
- The `maximum` is set to `Number.MAX_SAFE_INTEGER` to guard against accidental overflow in JS/TS runtimes; it is not a practical business cap.
