---
source: src/infrastructure/config/shared-rules/generate-spec.ts
sha256: c488887dc71ad8ba20e3607231d219e7bf082ee625a81ec2d51e25aa51756d77
generated_at: 2026-10-29T01:58:55.320295+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/generate-spec.ts

## Purpose

Defines the **spec types** that describe how a shared-rules YAML file is turned into a committed `as const` TypeScript file. It also provides a reusable Zod schema helper for validating the one list shape (`keyed-list`) that needs structural constraints. This file is consumed by the code-generation tooling (the `regenerate` script) and is **never imported at application runtime**.

## Key elements

- **`GenerateShape`** (`'verbatim' | 'keyed-list'`) — the two strategies for writing a top-level rules field into the generated file.
- **`GeneratedExport`** — describes a single exported constant: its name, shape, optional source field, and docblock.
- **`GenerateSpec`** — the full description of one rules file's output: the repo-relative path of the `.generated.ts` file and the ordered list of `GeneratedExport`s it contains.
- **`KeyedEntry`** — one entry in a `keyed-list` (a `value` string plus a `description` docblock).
- **`keyedListSchema(pattern: RegExp)`** — Zod schema factory. Validates an array of `KeyedEntry` where every `value` matches the given pattern, descriptions are non-empty, and no `value` appears twice. Returns `z.ZodType<KeyedEntry[]>`.

## Relationships

- **`scripts/contracts/shared-rules-render.ts`** — the renderer that reads a `GenerateSpec` / `GeneratedExport` and emits the `.generated.ts` file. This file is its type contract.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — the script entry point that orchestrates reading specs and invoking the renderer.
- **`src/infrastructure/config/shared-rules/registry.ts`** — collects the `GenerateSpec` for every registered rules file so the generation script can iterate them.
- **`src/infrastructure/config/shared-rules/audit-actions.ts`** — an example rules file whose YAML is validated against `keyedListSchema` and rendered according to its `GenerateSpec`.
- **`src/modules/account/rules.schema.ts`**, **`src/modules/example/rules.schema.ts`**, **`src/modules/webhooks/rules.schema.ts`** — the committed `.generated.ts` outputs produced from their respective rules files using the types defined here.
- **`tests/unit/scripts/contracts/shared-rules-render.test.ts`** — unit tests that exercise the render path, implicitly verifying the shape of the spec types.

## Notes

- **Relative imports only.** The module docblock explicitly points to `src/infrastructure/config/shared-rules/load.ts` for the convention. Do not introduce absolute or package-style imports here.
- **`keyedListSchema` uses `z.strictObject`.** Unknown keys in a `KeyedEntry` will fail validation, so adding a field to the interface without updating the schema (or vice versa) will cause runtime Zod errors during `regenerate`.
- **Uniqueness is checked via a `refine` on the array**, not per-element. The error message is the plain string `'a value is listed twice'` with no path pointer, which can make debugging multi-field specs slightly harder.
- The file is a **type-and-schema definition only**; it contains no I/O, no file reading, and no code emission. All actual generation lives in the `scripts/contracts/` files.
