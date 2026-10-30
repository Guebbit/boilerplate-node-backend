---
source: src/infrastructure/config/shared-rules/registry.ts
sha256: 11745205feac040480e243f1a05fc8e8bf358a89bbe3c590774b6e95e6009335
generated_at: 2026-10-29T02:00:26.569295+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/registry.ts

## Purpose

Central registry that pairs every shared-rules YAML document with its Zod schema and (optionally) a spec for generating a typed TypeScript module. It is the single source of truth consumed both by the `regenerate` contract script (which emits `shared/rules/schemas/*.schema.json` and the `.generated.ts` files) and by boot-time loaders that validate live config against the same schemas.

## Key elements

- **`SharedRuleEntry`** — interface with two fields: `schema: z.ZodType` (the validation contract) and an optional `generate: GenerateSpec` (tells the generator where to write and what to export).
- **`SHARED_RULES`** — `Readonly<Record<string, SharedRuleEntry>>` mapping each rule's file name (without `.yaml`) to its entry. Contains 12 entries: `audit-actions`, `defaults`, `frontend-links`, `images`, `jobs`, `log-redaction`, `metrics`, `outbox`, `password-hash`, `rate-limits`, `semantic-log-names`.
- **`generate` spec (per entry)** — specifies `out` (target `.generated.ts` path), and an `exports` array where each export declares `exportName`, `shape` (`'verbatim'` or `'keyed-list'`), `field` (the top-level key in the YAML), and a human-readable `description`.

## Relationships

- **Imports schemas** from every sibling module in this directory: `audit-actions`, `defaults`, `frontend-links`, `images`, `jobs`, `log-redaction`, `metrics`, `outbox`, `password-hash`, `rate-limits`, `semantic-log-names`.
- **Imports `GenerateSpec`** type from `./generate-spec`.
- **Consumed by** `scripts/contracts/generate-shared-rule-schemas.ts` (the `regenerate` command) which iterates `SHARED_RULES` to write schema JSONs and run the TypeScript generator for entries that declare a `generate` block.
- **Consumed by** boot-time loaders (via `load.ts` in the same directory) to validate runtime configuration against the same Zod schemas at startup.

## Notes

- The file enforces **relative imports only** (see the doc-comment reference to `load.ts`); do not add bare/aliased imports here.
- Not every entry declares a `generate` block — `frontend-links`, `log-redaction`, and `password-hash` are schema-only rules with no generated TypeScript output.
- The registry key must match the YAML file name (minus extension); it is what the generator and loaders use to locate the document on disk.
- `shape: 'keyed-list'` (used by `audit-actions`) means the generator emits a keyed array from the specified `field`; `'verbatim'` copies the field's value as-is into the generated module.
