---
source: src/infrastructure/config/shared-rules/registry.ts
sha256: 3e2ab265cb5ebd4ea364b47f7215980802b3137a1569fea9e4541eb59bdf9bb0
generated_at: 2026-11-14T17:59:09.284430+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/registry.ts

## Purpose

Central registry that maps every shared-rules YAML file name (without extension) to its Zod schema and, optionally, a spec describing the TypeScript file to generate from that data. Both the schema-regeneration script and the boot-time config loaders consume this single list, so adding or removing a rule only requires touching this file.

## Key elements

- **`SharedRuleEntry`** (exported interface) — pairs a `schema: z.ZodType` with an optional `generate: GenerateSpec`. The optional flag signals "this rule's data is consumed as typed code, not just validated YAML."
- **`SHARED_RULES`** (exported `Readonly<Record<string, SharedRuleEntry>>`) — the complete lookup table. Keys are the rule file names sans `.yaml` (e.g. `'audit-actions'`, `'rate-limits'`). Each entry wires in the schema from the sibling module and, when applicable, declares:
  - `generate.out` — absolute project path of the `.generated.ts` to emit.
  - `generate.exports` — one or more `{ exportName, shape, field, description }` descriptors that tell the generator what to extract and how (`shape` is `'verbatim'` or `'keyed-list'`).
- **Schema imports** — one named import per sibling rule module (e.g. `auditActionsSchema` from `./audit-actions`). This file is the *only* place all schemas are re-exported together.
- **`GenerateSpec` type** — imported from `./generate-spec`; defines the shape of the optional `generate` property.

## Relationships

- **`scripts/contracts/generate-shared-rule-schemas.ts`** — reads `SHARED_RULES` at build time to regenerate each rule's JSON schema and to emit the `.generated.ts` files whose paths and export specs are declared in each entry's `generate` field.
- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — provides the `GenerateSpec` type that `SharedRuleEntry.generate` references.
- **Sibling rule modules** (`audit-actions.ts`, `cookies.ts`, `defaults.ts`, `frontend-links.ts`, `images.ts`, `jobs.ts`, `log-redaction.ts`, `metrics.ts`, `outbox.ts`, `password-hash.ts`, `rate-limits.ts`, `semantic-log-names.ts`) — each exports a named Zod schema that this registry imports and exposes via `SHARED_RULES`.

## Notes

- Only **relative imports** are permitted in this directory (enforced by convention documented in `load.ts`). Do not use package-name imports here.
- Three rules — `frontend-links`, `log-redaction`, `password-hash` — have **no `generate` spec**; they are validated at boot but never emitted as typed constants.
- Generated output files are scattered across the codebase (`src/app/`, `src/kernel/`, `src/infrastructure/http/`, etc.), not colocated with this registry.
- The key `'audit-actions'` uses the `keyed-list` shape (extracting a sub-field `actions` as a keyed object), while all other entries use `verbatim`.
- The record is typed `Readonly` to discourage accidental mutation; treat it as a static catalog.
