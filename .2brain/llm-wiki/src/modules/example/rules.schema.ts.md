---
source: src/modules/example/rules.schema.ts
generated_at: 2026-11-22T05:11:19.447132+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/rules.schema.ts

## Purpose
Defines the schema of the example module's `rules.yaml` (audit action names and analytics event names, kept as data that the PHP twin copies) and declares what `npm run regenerate` writes from it. It is the module-local piece of the shared-rules system.

## Key elements
- `rulesSchema` — strict Zod object (`z.strictObject`) describing `rules.yaml`, with two fields:
  - `audit` — a keyed list whose names must match `^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$`, i.e. dotted `noun.verb` strings with 2–4 segments. Names must be unique across modules (checked by `tests/cross-cutting/audit-actions.test.ts`).
  - `analytics` — a keyed list whose names must be snake_case with at least two lowercase-letter words (`^[a-z]+(_[a-z]+)+$`).
- `rulesGenerate` — a `GenerateSpec` whose output target is `rules.generated.ts` in this module's directory, with two `keyed-list` exports:
  - `exampleAuditActions`, from the `audit` field.
  - `exampleAnalyticsEvents`, from the `analytics` field.

## Relationships
- Imports `keyedListSchema` and the `GenerateSpec` type from `src/infrastructure/config/shared-rules/generate-spec.ts`. `keyedListSchema` builds both list fields, and `GenerateSpec` types `rulesGenerate`, which the shared-rules generator consumes to produce the output file.

## Notes
- `z.strictObject` rejects any key in `rules.yaml` other than `audit` and `analytics`.
- The generated output is rewritten by `npm run regenerate`, so it should not be edited by hand.
