---
source: scripts/audit/code-shape/scripts/generate-shallow-candidates.ts
generated_at: 2026-11-22T01:51:36.652063+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/code-shape/scripts/generate-shallow-candidates.ts

## Purpose
CLI entry point for the `code-shape` audit's "shallow candidates" pass. It builds a TypeScript program for the whole repo, runs `findShallowCandidates` over a chosen scope, and writes the result to `<out>/shallow.json` inside the run's report folder. It is kept separate from `./shallow-candidates.ts` so that module's counting logic can be unit-tested without executing this script's side effects.

## Key elements
- **Usage**: `npm run audit:shallow -- --out <dir> [path...]`. Positional arguments are repo-relative path prefixes.
- **`DEFAULT_SCOPE`**: `src`, `scripts`, `scenarios`, `tests/support`. This is used when no paths are given.
- **`--out` parsing**: reads `--out <dir>` from `process.argv`. If it is missing, the script throws a usage error. The remaining arguments (with `--out` and its value removed) become `scopeArguments`.
- **`OUTPUT`**: `<REPO_ROOT>/<out>/shallow.json`.
- **Program construction**: reads `tsconfig.json` with `ts.readConfigFile`, expands it with `ts.parseJsonConfigFileContent`, and creates one `ts.createProgram` for the whole project so the checker can resolve every import.
- **Report**: calls `findShallowCandidates(program, REPO_ROOT, scope)`. It creates the output directory, then writes `{ scope, ...report }` as pretty-printed JSON.
- **Console summary**: prints the counts of `smallAndRare`, `passThroughs`, `optionalNeverPassed` and `lazyFiles`, followed by the output path relative to the repo root.

## Relationships
- Imports `findShallowCandidates` from `./shallow-candidates`, which holds the analysis. This file only handles arguments, program setup and output.
- Imports `REPO_ROOT` from `scripts/modules-on-disk.ts`. It uses it to resolve the output path, locate the project config, and make the output path repo-relative in the console message.

## Notes
- All work runs at module top level with no exported functions. Importing the file triggers the audit.
- Output goes only to the `--out` folder, per the audit rules cited in the file (rules 1 and 4 of the audit's `RULES.md`).
- The program covers every file in the parsed `tsconfig.json` file list, regardless of scope. The scope is only passed to `findShallowCandidates`.
