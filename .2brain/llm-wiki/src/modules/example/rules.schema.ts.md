---
source: src/modules/example/rules.schema.ts
sha256: c67d6e5da34890fd2089d2b65d0edc1cc6172646e06131e4c7568e235242d6e8
generated_at: 2026-11-14T20:00:11.367554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rules.schema.ts

## Purpose

Defines the Zod validation schema for this module's `rules.yaml` file and declares what the `npm run regenerate` codegen step should emit from it. Acts as the single source of truth for the audit-action and analytics-event vocabulary owned by the `example` module.

## Key elements

- **`rulesSchema`** — A `z.strictObject` with two fields:
  - `audit`: a `keyedListSchema` of dotted `noun.verb` strings (1–3 segments, lowercase/digits/underscores). Must be unique across all modules (enforced by `tests/cross-cutting/audit-actions.test.ts`).
  - `analytics`: a `keyedListSchema` of snake-case event names (lowercase words separated by underscores).
- **`rulesGenerate`** — A `GenerateSpec` telling the codegen pipeline to write `src/modules/example/rules.generated.ts` containing two keyed-list exports: `exampleAuditActions` (from `audit`) and `exampleAnalyticsEvents` (from `analytics`).

## Relationships

- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — Provides the `keyedListSchema` helper (used to type both schema fields as ordered, unique-string lists) and the `GenerateSpec` interface that `rulesGenerate` conforms to. This file is the consumer; that file is the infrastructure contract.

## Notes

- This file is *declarative only*: it does not execute at runtime in the app. Its two exports are read by the codegen tool (`generate-spec.ts` consumer) and by the Zod validation test. The actual typed constants (`exampleAuditActions`, `exampleAnalyticsEvents`) live in the generated `rules.generated.ts`, not here.
- The module docblock notes this file is the "data the PHP twin copies," so the schema doubles as a cross-language contract.
- Naming conventions are enforced by regex, not by Zod's built-in helpers: audit keys use dotted `noun.verb` form; analytics keys use `_`-separated lowercase words. See `docs/tools/analytics.md#naming` for the broader convention.
