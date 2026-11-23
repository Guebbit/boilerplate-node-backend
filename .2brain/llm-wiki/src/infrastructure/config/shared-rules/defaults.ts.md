---
source: src/infrastructure/config/shared-rules/defaults.ts
source_sha256: 44c4c25102ea6e9610d76b1467a1c083b5ec5eb4edc081713d9819bfcdf8d2d8
context_sha256: f618544957dfde5821e1c9b775cfb10e9fb92d5294521a3fb3c5e28ce31b1ede
generated_at: 2026-11-22T02:44:44.244676+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/defaults.ts

## Purpose
Defines the Zod schema for `shared/rules/defaults.yaml`, which holds the plain-number defaults that both backends start from. Each value can be overridden by an environment variable, and the twin backend reads the same numbers.

## Key elements
- `defaultsSchema` (exported): a strict object with a single top-level `defaults` key. Unknown keys are rejected at every level (`z.strictObject`). Sections under `defaults`:
  - `responseCache`: `devTtlMaxSeconds` (integer, >= 0; the longest TTL in seconds a development run may ask for) and `maxBytes` (positive; the largest body the cache stores).
  - `idempotency`: `retentionHours` (positive; hours a stored response can be replayed).
  - `pagination`: `pageSize` (positive; rows per page when the caller gives no limit).
  - `images`: `maxInputPixels`, `maxDimension`, `thumbnailDimension` and `quarantineRetentionHours`. All are positive. The last is how long a quarantined upload is left alone before it counts as abandoned.
  - `uploads`: `maxBytes` (positive; the largest upload body accepted, checked before any image decoding).
- `positive` (module-private): `z.int().positive()`, a positive whole number, shared by almost every field.

## Relationships
- `registry.ts` is a neighbor in the dependency graph, so it is presumably where this schema is consumed or registered. The file itself only exports the schema.
- `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` is the unit test that covers the schemas, which presumably includes this one.

## Notes
- Imports are relative only. The only import here is `zod`, but the module header says to follow the rule explained in `src/infrastructure/config/shared-rules/load.ts`.
- `devTtlMaxSeconds` is the only field that may be `0`. Every other field must be at least 1.
- All numbers must be integers (`z.int()`), so fractional values in the YAML fail validation.
