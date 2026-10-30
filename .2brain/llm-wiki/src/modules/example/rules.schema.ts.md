---
source: src/modules/example/rules.schema.ts
sha256: 5aaa6e7d198192973dbfd2cdac8f0f590de9613e40937540956fd781e9de52d9
generated_at: 2026-10-29T03:54:52.819861+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rules.schema.ts

## Purpose

Defines the Zod schema for the example module's `rules.yaml` and the `GenerateSpec` that tells `npm run regenerate` what to emit. It serves as the canonical example of the shared-rules pattern, demonstrating how a module declares its audit actions and analytics events and how those lists get code-generated into a TypeScript module.

## Key elements

- **`rulesSchema`** — A `z.strictObject` with two fields, each a `keyedListSchema`:
  - `audit`: dotted `noun.verb` strings (e.g. `order.created`), validated against `/^[a-z_]+(\.[a-z_]+)+$/`.
  - `analytics`: snake-case event names (e.g. `button_click`), validated against `/^[a-z]+(_[a-z]+)+$/`.
- **`rulesGenerate`** — A `GenerateSpec` object specifying the output path (`src/modules/example/rules.generated.ts`) and two exports: `exampleAuditActions` (keyed-list from `audit`) and `exampleAnalyticsEvents` (keyed-list from `analytics`).

## Relationships

- **Imports from `src/infrastructure/config/shared-rules/generate-spec.ts`**: pulls in `keyedListSchema` (the reusable Zod list validator) and the `GenerateSpec` type that every module's generate spec must conform to. This file is the concrete instantiation of the pattern that `generate-spec.ts` defines.

## Notes

- Uniqueness of `audit` keys is *not* enforced here; it's checked cross-module by `tests/cross-cutting/audit-actions.test.ts`.
- The schema is `strictObject`, so any extra top-level key in `rules.yaml` will cause a validation failure.
- The generated output file (`rules.generated.ts`) is a build artifact—do not edit it by hand; modify `rules.yaml` and re-run `npm run regenerate`.
- This module exists to document the pattern; see `docs/theory/shared-rules.md` for the broader design rationale.
