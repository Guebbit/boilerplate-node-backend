---
source: src/infrastructure/config/shared-rules/generate-spec.ts
source_sha256: 72fcd6a4b19f4727e39024a579d86b32e140e6b0cb04fe1297c767d68b3a229f
context_sha256: 71c404c5b0a7512ff230fd46fd7b8c03b786972cd6e1239122ffda0d33afa23b
generated_at: 2026-11-22T02:45:02.710339+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/generate-spec.ts

## Purpose
Defines the types a shared-rules file uses to declare how it becomes a committed `as const` TypeScript file, plus a Zod schema helper for the one list shape that needs extra validation. It is read by the `regenerate` step only, never at runtime. It uses relative imports only, for the reason documented in `load.ts`.

## Key elements
- `GenerateShape` — `'verbatim' | 'keyed-list'`.
  - `verbatim` dumps the parsed data as an `as const` literal.
  - `keyed-list` turns a list of `{ value, description }` into `{ KEY: 'value' }`, with one JSDoc per key.
- `GeneratedExport` — one exported constant in a generated file. Its fields are `exportName`, `shape`, an optional `field` (the top-level YAML field it comes from; the whole document when absent), and `description` (the constant's docblock).
- `GenerateSpec` — what a rules file generates. `out` is the repo-relative path of the committed generated TypeScript file. `exports` is the ordered, readonly list of `GeneratedExport`.
- `KeyedEntry` — one `keyed-list` entry. `value` is the wire string from which the key is derived. `description` is the key's docblock.
- `keyedListSchema(pattern)` — returns `z.ZodType<KeyedEntry[]>`. It requires a non-empty array of strict objects. Each `value` must match `pattern`, and each `description` must be non-empty. Duplicate `value`s are rejected with the message "a value is listed twice".

## Relationships
- The generator scripts `scripts/contracts/generate-shared-rule-schemas.ts` and `scripts/contracts/shared-rules-render.ts` are the likely consumers of `GenerateSpec`. Rendering is covered by `tests/unit/scripts/contracts/shared-rules-render.test.ts`.
- `registry.ts` and `audit-actions.ts` in the same folder, along with the module schemas `src/modules/account/rules.schema.ts`, `src/modules/example/rules.schema.ts` and `src/modules/webhooks/rules.schema.ts`, sit alongside this file in the dependency graph. These are the places where a rule declares its spec or uses `keyedListSchema`.

## Notes
- `strictObject` means unknown keys in a list entry are rejected.
- Key derivation from `value` is not implemented here. This file only validates and describes the shape.
