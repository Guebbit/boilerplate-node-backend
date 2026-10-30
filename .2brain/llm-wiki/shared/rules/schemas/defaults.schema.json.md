---
source: shared/rules/schemas/defaults.schema.json
sha256: 6269ee07d5a6af20200f70afa52b2fab6a558894a7e4e1b9f2275cbfc4319ec0
generated_at: 2026-10-29T01:48:05.804880+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/defaults.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a top-level `defaults` configuration object. It enforces the structure, types, and allowed ranges for runtime default values across five subsystems (response cache, idempotency, pagination, images, uploads), ensuring any consumer of these defaults receives a fully-typed, strictly-shaped payload.

## Key elements

- **`defaults`** (root, required) — container object; no extra keys allowed.
- **`defaults.responseCache`** — requires `devTtlMaxSeconds` (int ≥ 0) and `maxBytes` (int > 0). Governs dev-mode cache TTL ceiling and byte-size cap.
- **`defaults.idempotency`** — requires `retentionHours` (int > 0). Governs how long idempotency keys are retained.
- **`defaults.pagination`** — requires `pageSize` (int > 0). Governs default items-per-page.
- **`defaults.images`** — requires `maxInputPixels`, `maxDimension`, `thumbnailDimension`, `quarantineRetentionHours` (all int > 0). Governs image ingestion limits and quarantine policy.
- **`defaults.uploads`** — requires `maxBytes` (int > 0). Governs maximum upload size.
- All numeric fields cap at **9007199254740991** (`Number.MAX_SAFE_INTEGER`).
- Every object node sets `"additionalProperties": false` for strict validation.

## Relationships

No graph neighbors are recorded for this file. It is a standalone schema definition; any validator or config loader that references it would do so by path, not by code import.

## Notes

- `devTtlMaxSeconds` is the only field that **permits zero** (`"minimum": 0`); every other numeric field uses `"exclusiveMinimum": 0`, meaning it must be at least 1.
- Because `additionalProperties: false` is set at every level, adding any new key to the defaults object will cause validation to fail — the schema must be updated first.
- The schema is purely structural; it carries no `$ref`, `$id`, or `$defs`, so it cannot be composed into other schemas.
