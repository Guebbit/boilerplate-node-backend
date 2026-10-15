---
source: scripts/scaffold/options.ts
sha256: 27d5284d49b619b4d51786902e2505e9459587c9ebbd5c1fc1a6ef425a579af1
generated_at: 2026-10-15T09:47:01.237793+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/options.ts

## Purpose

Parses the CLI arguments for `scaffold:module` into a typed `ScaffoldOptions` object (or a `ParseRefusal` explaining why the arguments are invalid). Kept as a pure module so the CLI entry point remains a thin I/O wrapper around it.

## Key elements

- **`ScaffoldOptions`** — the output type: `name`, optional `entity`, `group` (foundation or shop), `summary`, `audit`, `regenerate`.
- **`ParseRefusal`** — `{ error: string }`, returned when the arguments cannot be turned into valid options.
- **`parseArguments(argv)`** — main entry point. Extracts the single positional `name`, validates it, reads `--entity`, `--group`, `--summary` flags and the `--no-audit` / `--no-regenerate` toggles, and returns either `ScaffoldOptions` or `ParseRefusal`.
- **`isRefusal(result)`** — type guard distinguishing a `ParseRefusal` from `ScaffoldOptions`.
- **`USAGE`** — multi-line help string for display on refusal.
- **`valueAfter`** (private) — reads the value following a flag, returning `undefined` if the flag is last or immediately followed by another flag.

## Relationships

- **`scripts/scaffold/names.ts`** — imports `isValidModuleName` and `isValidEntityName` for validating the positional name and `--entity` value.
- **`scripts/docs/module-descriptor.ts`** — imports the `ModuleDescriptor` type solely to constrain the `group` field to `Exclude<ModuleDescriptor['group'], 'example'>`.
- **`scripts/scaffold/scaffold-module.ts`** — the CLI entry point that calls `parseArguments` and branches on `isRefusal` before delegating to plan/apply.
- **`scripts/scaffold/plan.ts` / `scripts/scaffold/apply.ts`** — downstream consumers of the resolved `ScaffoldOptions`.
- **`scripts/scaffold/templates-code.ts` / `scripts/scaffold/templates-documentation-tests.ts`** — receive options values (name, entity, group, audit, etc.) to shape generated output.
- **`tests/unit/scripts/scaffold/options.test.ts`** — unit tests for `parseArguments` and `isRefusal`.
- **`tests/unit/scripts/scaffold/apply.test.ts` / `plan.test.ts`** — exercise the scaffold pipeline with valid options produced by this module.
- **`tests/cross-cutting/process-snapshot.test.ts`** — snapshots the `USAGE` text / refusal output at the process level.

## Notes

- `parseArguments` uses a discriminated-union return (`ScaffoldOptions | ParseRefusal`) rather than throwing. Callers must check with `isRefusal` before treating the result as options.
- The `group` field intentionally excludes `'example'` so the scaffolder can never produce a throwaway module.
- `summary` defaults to a `TODO:` placeholder rather than being required; the caller is expected to fill it in later.
- `--no-audit` and `--no-regenerate` are negation flags (absence means the feature is **on**), which is the opposite polarity of the other flags.
- The positional-name extraction filters out values that follow `--entity`, `--group`, or `--summary` by checking the preceding argument, so a value like `--entity foo` is not mistaken for a second positional.
