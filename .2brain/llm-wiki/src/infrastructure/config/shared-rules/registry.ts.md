---
source: src/infrastructure/config/shared-rules/registry.ts
generated_at: 2026-11-22T02:46:35.399629+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/registry.ts

## Purpose
Single list of every shared rules file (keyed by file name without `.yaml`) together with its Zod schema and, optionally, a spec for generating a TypeScript file from the data. `regenerate` reads it to write `shared/rules/schemas/<name>.generated.schema.json` and the generated TypeScript files for entries that declare a `generate` spec; the boot-time loaders read the same schemas.

## Key elements
- `SharedRuleEntry` (interface):
  - `schema: z.ZodType` is what the document must satisfy.
  - `generate?: GenerateSpec` is present when code needs the data as types (for example, when the data types a union), so code imports a generated file instead of the YAML.
- `SHARED_RULES: Readonly<Record<string, SharedRuleEntry>>` maps each rules file name to its entry. Each `generate` spec names an output path and the export(s) to write. Entries:
  - `audit-actions` → generates `src/infrastructure/observability/audit-actions.generated.ts` (`coreAuditActions`, `keyed-list` over `actions`)
  - `cookies` → generates `src/infrastructure/http/cookies.generated.ts` (`cookieData`)
  - `defaults` → generates `src/infrastructure/config/defaults.generated.ts` (`sharedDefaults`)
  - `images` → generates `src/infrastructure/adapters/images.generated.ts` (`imageRuleData`)
  - `jobs` → generates `src/app/jobs.generated.ts` (`appJobData`)
  - `metrics` → generates `src/infrastructure/observability/metrics.generated.ts` (`infrastructureMetricData`)
  - `outbox` → generates `src/kernel/outbox.generated.ts` (`outboxRuleData`)
  - `rate-limits` → generates `src/infrastructure/http/middlewares/rate-limits.generated.ts` (`infrastructureRateLimitData`)
  - `semantic-log-names` → generates `src/infrastructure/adapters/semantic-log-names.generated.ts` (`semanticLogNameData`)
  - `frontend-links`, `log-redaction` and `password-hash` have a schema only and generate no TypeScript.

The output paths above are targets written by `regenerate`, not files that necessarily exist in the repository until it has run.

## Relationships
- Imports one `*Schema` from each sibling file: `audit-actions.ts`, `cookies.ts`, `defaults.ts`, `frontend-links.ts`, `images.ts`, `jobs.ts`, `log-redaction.ts`, `metrics.ts`, `outbox.ts`, `password-hash.ts`, `rate-limits.ts` and `semantic-log-names.ts`.
- Imports the `GenerateSpec` type from `generate-spec.ts`, which defines the shape of each `generate` block.
- `scripts/contracts/generate-shared-rule-schemas.ts` is a graph neighbor. The file's own header names `regenerate` as the consumer that writes the JSON schemas and generated TypeScript files.

## Notes
- Use relative imports only in this file (the header points to a `load.ts` in the same directory for why).
- Every generated export in the current entries uses `shape: 'verbatim'`, except `audit-actions`, which uses `'keyed-list'`.
- Adding a new rules file means adding both its schema import and an entry here. Add `generate` only if code needs the data as types.
- Some descriptions say the generated data is only part of the picture. For example, `jobs.ts` and `rate-limit.ts` add behavior on top of the generated data, and the environment overrides some `defaults` and `outbox` values.
