---
source: src/infrastructure/config/shared-rules/defaults.ts
sha256: 4c753e098c91f11fbf4a43bdd4953c443d2a5dc9335043e73f4b02ac5afc794b
generated_at: 2026-11-08T03:26:02.101057+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/defaults.ts

## Purpose

Declares the Zod schema (`defaultsSchema`) that validates the shape of `shared/rules/defaults.yaml`. That YAML holds the plain-number runtime defaults (cache TTLs, size limits, pagination, image bounds, upload caps) from which both backends start before any environment-variable override is applied.

## Key elements

- **`positive`** — reusable Zod matcher: `z.int().positive()`. Applied to every "must be ≥ 1" field.
- **`defaultsSchema`** (exported) — a `z.strictObject` wrapping a single `defaults` key. Inside, five sub-objects each use `z.strictObject` so unknown keys are rejected:
  - `responseCache` — `devTtlMaxSeconds` (int ≥ 0) and `maxBytes` (positive int).
  - `idempotency` — `retentionHours` (positive int).
  - `pagination` — `pageSize` (positive int).
  - `images` — `maxInputPixels`, `maxDimension`, `thumbnailDimension`, `quarantineRetentionHours` (all positive ints).
  - `uploads` — `maxBytes` (positive int).

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — consumes `defaultsSchema` (likely registers it alongside other shared-rule schemas so the loader in `load.ts` can validate `defaults.yaml` at boot).
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — unit-tests the schema, asserting that valid/invalid shapes are accepted or rejected as expected.

## Notes

- Every object layer is `strictObject`, so adding a new key to the YAML without updating this schema will cause a parse failure. Keep the two in lockstep.
- `devTtlMaxSeconds` is the **only** field that permits `0` (`z.int().min(0)`); all other numeric fields require ≥ 1 via the shared `positive` matcher.
- The module doc-comment mandates **relative imports only** (see `load.ts` for the convention); do not introduce bare-specifier imports here.
- The twin backend reads the same YAML, so any schema change must stay compatible with both consumers.
