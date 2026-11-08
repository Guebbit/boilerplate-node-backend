---
source: src/infrastructure/config/shared-rules/generate-spec.ts
sha256: c488887dc71ad8ba20e3607231d219e7bf082ee625a81ec2d51e25aa51756d77
generated_at: 2026-11-08T03:26:20.412057+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/generate-spec.ts

## Purpose

Defines the type-level contract for how a rules file is turned into a committed `as const` TypeScript file. It declares the shape of generation output (`GenerateSpec`, `GeneratedExport`) and provides the one Zod schema helper (`keyedListSchema`) needed to validate a `keyed-list` field. This module is consumed by the code-generation pipeline at build time, never at runtime.

## Key elements

- **`GenerateShape`** — Union type (`'verbatim' | 'keyed-list'`) describing how a single top-level rules field is written into the generated file.
- **`GeneratedExport`** — Interface describing one exported constant in the output: its name, shape, source field, and docblock.
- **`GenerateSpec`** — Top-level interface: the output path (`out`) and the ordered list of `GeneratedExport`s.
- **`KeyedEntry`** — Single entry shape for a `keyed-list` field (`value` + `description`).
- **`keyedListSchema(pattern: RegExp)`** — Returns a Zod schema validating an array of `KeyedEntry` objects: non-empty, each `value` matches `pattern`, `description` is non-empty, and `value`s are unique.

## Relationships

- **`scripts/contracts/shared-rules-render.ts`** — Consumes `GenerateSpec` / `GeneratedExport` to render the actual `.generated.ts` output.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Drives the regeneration pipeline; imports these types to validate specs before invoking the renderer.
- **`src/infrastructure/config/shared-rules/registry.ts`** — Registers rules whose `GenerateSpec` is defined against these types.
- **`src/infrastructure/config/shared-rules/audit-actions.ts`** — A concrete rules file whose generation is described by a `GenerateSpec` conforming to this module's interfaces.
- **`src/modules/account/rules.schema.ts`**, **`src/modules/example/rules.schema.ts`**, **`src/modules/webhooks/rules.schema.ts`** — The committed generated outputs whose structure is dictated by `GenerateSpec` / `GeneratedExport` instances declared for their respective rules.
- **`tests/unit/scripts/contracts/shared-rules-render.test.ts`** — Unit-tests the renderer against these type contracts.

## Notes

- The module header mandates **relative imports only**, citing `src/infrastructure/config/shared-rules/load.ts` as the canonical example. Do not use package/bare imports in files that depend on this convention.
- `keyedListSchema` is the *only* runtime-exported value (a function); everything else is type-level. Importers that only need the types can use `import type`.
- The design is intentionally minimal: only the `keyed-list` shape required a validation helper. `verbatim` fields are passed through as-is and need no schema here.
