---
source: scripts/scaffold/options.ts
source_sha256: cc95b7f8f89646267676bfd4ea047831f3fbb8897d1ea8e6dc698dbcdc9ff4ab
context_sha256: b881a6140d0e60ae533b003da0a0259972bc139855925fbfa6d900dd27957664
generated_at: 2026-11-22T02:15:53.228015+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/options.ts

## Purpose
Parses the `scaffold:module` command line into a typed `ScaffoldOptions` object. It is pure: `argv` goes in, and either options or a refusal comes out. This keeps the CLI's I/O layer a thin shell around it.

## Key elements
- `ScaffoldOptions`: the parsed option set.
  - `name`: the folder name.
  - `entity?`: an optional explicit record type name.
  - `group`: `'foundation'` or `'shop'` (the `ModuleDescriptor` group type minus `'example'`).
  - `summary`: one sentence for the docs index.
  - `audit`: whether to emit `audit.ts` and record actions.
  - `regenerate`: whether to run `regenerate --no-sync` afterwards.
- `USAGE`: the usage text, printed on a refusal.
- `ParseRefusal`: `{ error: string }`, holding the reason the arguments are unusable.
- `parseArguments(argv)`: returns `ScaffoldOptions | ParseRefusal`.
  - It takes the single positional argument as the module name.
  - It reads the `--entity`, `--group` and `--summary` values.
  - It treats `--no-audit` and `--no-regenerate` as switches.
- `isRefusal(result)`: a type guard that checks for an `error` key.
- `valueAfter` (private): returns the token after a flag, or `undefined` if it is missing or starts with `--`.

## Relationships
- Imports `isValidModuleName` and `isValidEntityName` from `./names` to validate the name and entity.
- Imports the `ModuleDescriptor` type from `scripts/docs/module-descriptor.ts` to derive the allowed `group` values.
- The other scaffold files (`apply.ts`, `plan.ts`, `scaffold-module.ts`, the templates) and the unit tests (`options.test.ts`, `apply.test.ts`, `plan.test.ts`) are graph neighbors. They presumably consume `ScaffoldOptions`, but this file does not show how.

## Notes
- Defaults:
  - `group` is `foundation`.
  - `summary` is `TODO: one sentence on what <name> is for.`
  - `audit` and `regenerate` are `true`.
- Validation order:
  1. A missing name is refused.
  2. A second positional argument is refused.
  3. An invalid module name is refused. The message says digits are refused because permission keys are letters and dots only.
  4. An invalid `--entity` (it must be PascalCase) is refused.
  5. A `--group` other than `foundation` or `shop` is refused.
- Positional detection skips any `--` token and any token directly after `--entity`, `--group` or `--summary`. An unknown `--flag` is silently ignored rather than refused.
- If a value flag has no value, because it is last or followed by another flag, it falls back to its default. For `--entity`, that means it is treated as absent.
- Because the token after a value flag is excluded from the positional list, a value that begins with `--` is not accepted as a flag value.
