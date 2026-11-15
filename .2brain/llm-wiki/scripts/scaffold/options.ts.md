---
source: scripts/scaffold/options.ts
sha256: 9390c64526a041e67d4b780927aeb484a0d7cee6000935c75b18e35f0825c82a
generated_at: 2026-11-14T17:41:40.255045+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/options.ts

## Purpose

Parses the raw CLI arguments passed to `scaffold:module` into a typed `ScaffoldOptions` object (or a `ParseRefusal` on bad input). The file is deliberately pure—`argv` in, options or refusal out—so the shell script or runner that invokes it can stay a thin I/O layer without any parsing logic of its own.

## Key elements

- **`ScaffoldOptions`** — interface describing every knob a caller can set: `name`, optional `entity`, `group` (`foundation` | `shop`), `summary`, `audit`, `regenerate`.
- **`ParseRefusal`** — minimal `{ error: string }` shape returned when the arguments are invalid.
- **`USAGE`** — the multi-line help string printed when a refusal occurs.
- **`parseArguments(argv)`** — the main parser. Extracts the single positional `name`, validates it via `isValidModuleName`, reads `--entity` / `--group` / `--summary` flags (via the internal `valueAfter` helper), checks `--no-audit` / `--no-regenerate` boolean flags, and returns either a populated `ScaffoldOptions` or a `ParseRefusal`.
- **`isRefusal(result)`** — type guard that narrows the union to `ParseRefusal` (checks for the `error` key).

## Relationships

- **`scripts/scaffold/names.ts`** — imports `isValidEntityName` and `isValidModuleName` for validation of the positional name and `--entity` value.
- **`scripts/docs/module-descriptor.ts`** — imports the `ModuleDescriptor` type solely to constrain `ScaffoldOptions['group']` to `Exclude<ModuleDescriptor['group'], 'example'>`.
- **`scripts/scaffold/plan.ts` / `apply.ts`** — downstream consumers in the scaffold pipeline that receive the `ScaffoldOptions` object this file produces.
- **`scripts/scaffold/scaffold-module.ts`** — the CLI entry point that calls `parseArguments` and branches on `isRefusal`.
- **`tests/unit/scripts/scaffold/options.test.ts`** — unit tests for `parseArguments` and `isRefusal`.

## Notes

- The `group` type uses `Exclude<…, 'example'>`, so the literal `'example'` value that exists on `ModuleDescriptor['group']` is deliberately not accepted at the scaffold level.
- `--no-audit` and `--no-regenerate` are the *negation* flags; their absence means the feature is **on** (default `true`). The USAGE text makes this explicit, but it's an easy inversion to miss.
- `valueAfter` treats a `--`-prefixed token as "no value follows," so `--entity --group` yields `undefined` for entity rather than the string `"--group"`.
- The positional-argument filter in `parseArguments` works by checking whether the *previous* token is one of the value-taking flags (`--entity`, `--group`, `--summary`). This means a value that itself starts with `--` will be swallowed as the flag's value by `valueAfter` (returning `undefined`), not treated as a second flag.
