---
source: scripts/scaffold/options.ts
sha256: 27d5284d49b619b4d51786902e2505e9459587c9ebbd5c1fc1a6ef425a579af1
generated_at: 2026-11-08T03:00:01.112759+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/options.ts

## Purpose

Parses the raw `argv` array for the `scaffold:module` CLI command into a fully typed `ScaffoldOptions` object (or a structured refusal). The file is deliberately pure—no I/O, no side effects—so that the shell entry point (`scaffold-module.ts`) only handles printing and process-exit, while all validation logic lives here and is directly unit-testable.

## Key elements

- **`ScaffoldOptions`** (interface) — The complete, typed result of a successful parse: `name`, optional `entity`, `group`, `summary`, `audit`, `regenerate`.
- **`ParseRefusal`** (interface) — Single-field `{ error: string }` shape returned when arguments are invalid.
- **`parseArguments(argv)`** — Main entry point. Extracts the positional module name, validates it via `names.ts`, reads `--entity`/`--group`/`--summary` flags, defaults `summary` to a TODO string, and defaults `audit`/`regenerate` to `true` (overridable with `--no-audit` / `--no-regenerate`).
- **`isRefusal(result)`** — Type guard narrowing the `ScaffoldOptions | ParseRefusal` union.
- **`USAGE`** (const string) — Multi-line help text, printed by the caller on a refusal.
- **`valueAfter(argv, index)`** — Internal (not exported) helper that reads the token following a flag, returning `undefined` if the flag is last or followed by another `--` token.

## Relationships

- **`scripts/scaffold/names.ts`** — Imports `isValidModuleName` and `isValidEntityName` to validate the positional name and the optional `--entity` value before they enter the options object.
- **`scripts/docs/module-descriptor.ts`** — Imports the `ModuleDescriptor` type; the `group` field's type is `Exclude<ModuleDescriptor['group'], 'example'>`, tying the CLI vocabulary to the docs descriptor schema.
- **`scripts/scaffold/scaffold-module.ts`** — The CLI entry point that calls `parseArguments`, checks the result with `isRefusal`, prints `USAGE` on failure, and hands the `ScaffoldOptions` onward.
- **`scripts/scaffold/plan.ts`** — Consumes `ScaffoldOptions` to decide which files and templates to emit (e.g. the `audit` flag controls whether an `audit.ts` is planned).
- **`tests/unit/scripts/scaffold/options.test.ts`** — Unit tests exercising `parseArguments` and `isRefusal` against various argv shapes.

## Notes

- `group` is constrained to `'foundation' | 'shop'`; the `'example'` variant present on `ModuleDescriptor['group']` is explicitly excluded.
- Digits are refused in module names (not just "not a hyphen-separated lower-case word"). The error message explains the rationale: permission keys use only letters and dots.
- Boolean flags (`--no-audit`, `--no-regenerate`) are detected via `argv.includes(...)`, not via the `valueAfter` helper, so they take no value and are not treated as positional arguments.
- The positional-argument filter in `parseArguments` explicitly skips tokens that follow `--entity`, `--group`, or `--summary`, but does **not** skip tokens after `--no-audit`/`--no-regenerate` (they have no value to skip).
- `summary` silently defaults to a `TODO` string rather than erroring, so a caller can scaffold first and fill in the sentence later.
