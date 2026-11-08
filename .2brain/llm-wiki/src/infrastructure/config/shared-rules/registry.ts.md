---
source: src/infrastructure/config/shared-rules/registry.ts
sha256: 436b7b2c90357b961b53e45a37bd26fd07f54e80d012df8c72204c21dae694b9
generated_at: 2026-11-08T03:27:41.861657+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/registry.ts

## Purpose

Central registry that pairs every shared-rules YAML document with its Zod schema and an optional TypeScript generation spec. The `regenerate` script iterates this list to emit `shared/rules/schemas/<name>.schema.json` files and any declared `.generated.ts` modules; boot-time loaders read the same schemas for validation.

## Key elements

- **`SharedRuleEntry`** (exported interface) — one entry per rules file: a required `schema: z.ZodType` and an optional `generate?: GenerateSpec` describing the TypeScript file to emit.
- **`SHARED_RULES`** (exported const) — a `Readonly<Record<string, SharedRuleEntry>>` keyed by file name (without `.yaml`). Contains 13 entries covering audit-actions, cookies, defaults, frontend-links, images, jobs, log-redaction, metrics, outbox, password-hash, rate-limits, and semantic-log-names.
- **`GenerateSpec`** (type, imported from `./generate-spec`) — declares the output path, export name, shape (`'keyed-list'` or `'verbatim'`), source field, and a human-readable description.

## Relationships

- **Imports schemas** from every sibling in `shared-rules/`: `audit-actions`, `cookies`, `defaults`, `frontend-links`, `images`, `jobs`, `log-redaction`, `metrics`, `outbox`, `password-hash`, `rate-limits`, `semantic-log-names`.
- **Imports `GenerateSpec`** type from `./generate-spec`.
- **Consumed by** `scripts/contracts/generate-shared-rule-schemas.ts`, which reads `SHARED_RULES` to write JSON schema files and invoke TypeScript generation for entries that declare a `generate` block.
- **Referenced by** `src/infrastructure/config/shared-rules/load.ts` (boot-time loader) for the same schema validation at runtime.

## Notes

- Three entries (`frontend-links`, `log-redaction`, `password-hash`) have **no** `generate` block — they are validated at boot but produce no `.generated.ts` file.
- The only `shape: 'keyed-list'` entry is `audit-actions`; all others use `'verbatim'`.
- The module doc explicitly restricts this file to **relative imports** (see `load.ts` for the convention).
- `SHARED_RULES` is `Readonly`; do not mutate it at runtime.
