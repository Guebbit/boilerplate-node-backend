---
source: src/infrastructure/config/shared-rules/defaults.ts
sha256: 4c753e098c91f11fbf4a43bdd4953c443d2a5dc9335043e73f4b02ac5afc794b
generated_at: 2026-10-29T01:58:35.452526+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/defaults.ts

## Purpose

Defines the Zod schema that validates the shape of `shared/rules/defaults.yaml`. That YAML holds the plain-number defaults both backends start from before any environment-variable overrides are applied. Keeping the schema in TypeScript gives runtime validation and IDE support for the YAML's structure.

## Key elements

- **`positive`** (module-private) — A Zod schema for a positive whole number (`z.int().positive()`), reused across most fields.
- **`defaultsSchema`** (exported) — A `z.strictObject` describing the full YAML document. Top-level key is `defaults`, containing five sub-objects:
  - `responseCache` — `devTtlMaxSeconds` (≥ 0), `maxBytes` (> 0)
  - `idempotency` — `retentionHours` (> 0)
  - `pagination` — `pageSize` (> 0)
  - `images` — `maxInputPixels`, `maxDimension`, `thumbnailDimension` (all > 0), `quarantineRetentionHours` (> 0)
  - `uploads` — `maxBytes` (> 0)

All objects use `strictObject`, so unknown keys cause a parse failure.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Sibling in the same `shared-rules` directory; the registry imports `defaultsSchema` to validate (or register) the parsed defaults during the config-loading pipeline.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-test suite that exercises `defaultsSchema` against sample payloads to confirm accept/reject behavior.

## Notes

- `devTtlMaxSeconds` deliberately uses `z.int().min(0)` (zero is valid) rather than the shared `positive` alias, unlike every other numeric field.
- The module doc-block states "Relative imports only" and points to `load.ts` for the import convention in this directory—do not add barrel or absolute imports here.
- The JSDoc notes that "the twin reads the same numbers," indicating a dual-backend setup where both sides consume the identical defaults file; changing a field name or type here will break both.
