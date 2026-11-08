---
source: src/modules/webhooks/rules.schema.ts
sha256: 5608f366110c31e8be119ffbc206cbaf4753d1427a35ddd246381bfb59cb83f6
generated_at: 2026-11-08T09:04:51.595895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/rules.schema.ts

## Purpose

Defines the Zod schema for the `rules.yaml` webhook configuration file (retry delays and auto-disable thresholds) and declares the `GenerateSpec` that drives `npm run regenerate` to produce `rules.generated.ts`. It is the single source of truth for both validation and codegen of the shared rules data that the PHP twin consumes.

## Key elements

- **`rulesSchema`** – `z.strictObject` describing the full shape of `rules.yaml`:
  - `retry.delaysMs` – non-empty array of positive integers (the retry ladder, in ms).
  - `autoDisable.maxConsecutiveFailures` – positive integer; chain-exhaustion count before a subscription auto-disables.
  - `autoDisable.minFailingMs` – positive integer; minimum streak duration (ms) required to trigger auto-disable.
- **`rulesGenerate`** – A `GenerateSpec` object (typed via the imported interface) that tells the generator to emit `src/modules/webhooks/domain/rules.generated.ts` with two verbatim exports: `retryRules` (from the `retry` field) and `autoDisableRules` (from the `autoDisable` field).
- **`count`** – Module-private helper: `z.int().positive()`, reused for every numeric field.

## Relationships

- **Imports `GenerateSpec` (type-only) from `src/infrastructure/config/shared-rules/generate-spec.ts`.** This type defines the contract (`out`, `exports[]`) that the shared codegen tooling expects, ensuring `rulesGenerate` is structurally compatible with the generator in that directory.

## Notes

- The file is annotated `@module` and is not meant to be imported directly for runtime logic—its exports are consumed by the schema validator and the `regenerate` script, not by application code at runtime.
- `z.strictObject` is used at every level, so any unexpected key in `rules.yaml` will fail validation; adding a new field requires a schema change here *and* an entry in `rulesGenerate.exports` if it should appear in the generated file.
- The generated output path is hard-coded to `src/modules/webhooks/domain/rules.generated.ts`; moving the domain directory requires updating this string.
