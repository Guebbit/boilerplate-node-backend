---
source: src/modules/example/rules.schema.ts
sha256: 5aaa6e7d198192973dbfd2cdac8f0f590de9613e40937540956fd781e9de52d9
generated_at: 2026-11-08T05:52:34.280126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rules.schema.ts

## Purpose

Defines the Zod schema for the example module's `rules.yaml` and the `GenerateSpec` that `npm run regenerate` consumes to produce `rules.generated.ts`. This file is the single source of truth for the two rule lists (audit actions and analytics events) that the module owns and that the PHP twin copies from.

## Key elements

- **`rulesSchema`** – `z.strictObject` with two `keyedListSchema` fields:
  - `audit` – dotted `noun.verb` strings (regex `^[a-z_]+(\.[a-z_]+)+$`), unique across all modules (enforced by `tests/cross-cutting/audit-actions.test.ts`).
  - `analytics` – snake-case event names (regex `^[a-z]+(_[a-z]+)+$`).
- **`rulesGenerate`** – a `GenerateSpec` object telling the codegen tool to write `src/modules/example/rules.generated.ts` with two keyed-list exports: `exampleAuditActions` (from `audit`) and `exampleAnalyticsEvents` (from `analytics`).

## Relationships

- **Imports `keyedListSchema` and the `GenerateSpec` type** from `src/infrastructure/config/shared-rules/generate-spec.ts`, which provides the shared list-construction helper and the spec interface that every module's `.schema.ts` must satisfy.
- **Produces** `src/modules/example/rules.generated.ts` via the `npm run regenerate` pipeline (not a direct import relationship, but the declared output target of `rulesGenerate`).

## Notes

- `z.strictObject` means any key not listed in the schema causes a parse failure—add new fields here *before* adding them to `rules.yaml`.
- The `audit` regex requires at least one dot (i.e., at least two segments); a bare verb like `submit` is invalid.
- `GenerateSpec.exports[].field` must match a key in `rulesSchema`; a mismatch is a codegen-time error, not a compile-time one.
- See `docs/theory/shared-rules.md` for the broader "shared rules" pattern this file participates in.
