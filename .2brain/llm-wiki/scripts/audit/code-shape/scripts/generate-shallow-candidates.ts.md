---
source: scripts/audit/code-shape/scripts/generate-shallow-candidates.ts
sha256: fa510bc08c61eb2227ed9a04a16d97e35c900616e37216a7bafb8a892ae27db6
generated_at: 2026-11-08T02:37:14.930972+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/generate-shallow-candidates.ts

## Purpose

CLI entry point (`npm run audit:shallow -- [path...]`) that builds a full TypeScript program from the repo's `tsconfig.json`, runs the shallow-candidate analysis over a given scope, and writes the resulting JSON report to `tmp/reports/audit/code-shape/shallow.json`. It is deliberately split from `./shallow-candidates.ts` so that the latter's unit tests can import the counting logic without triggering this script's top-level side effects.

## Key elements

- **`DEFAULT_SCOPE`** — `['src', 'scripts', 'scenarios']`; the directories analyzed when no CLI arguments are supplied.
- **`OUTPUT`** — resolved path to the JSON report, derived from `REPO_ROOT`.
- **`rawConfig` / `parsed`** — reads `tsconfig.json` via `ts.readConfigFile` and expands its `include` globs into a concrete file list with `ts.parseJsonConfigFileContent`.
- **`program`** — a `ts.Program` created from the parsed config; gives the checker whole-project import resolution.
- **`scope`** — `process.argv.slice(2)` when args are present, otherwise `DEFAULT_SCOPE`.
- **`report`** — the return value of `findShallowCandidates(program, REPO_ROOT, scope)`; contains `smallAndRare`, `passThroughs`, `optionalNeverPassed`, and `lazyFiles` arrays.
- **Write + log block** — creates the output directory, serializes `{ scope, ...report }` as indented JSON, and prints a one-line summary to stdout.

## Relationships

- **`./shallow-candidates.ts`** — exports `findShallowCandidates`, the actual analysis logic. This script is a thin I/O wrapper around it; the module doc-block explicitly calls out the separation so the unit test can import the function without executing this file's top-level code.
- **`../../../modules-on-disk.ts`** — supplies `REPO_ROOT`, the single source of truth for the repository's absolute path, used here for `tsconfig.json` lookup, `parseJsonConfigFileContent` base directory, and the `OUTPUT` path.

## Notes

- This file is a **script**, not a reusable module: every statement runs at top level, including `ts.createProgram` (expensive) and `writeFileSync`. Importing it from another module would execute all of that.
- The TypeScript program is built once at load time from the **root** `tsconfig.json`; it is not scoped to the `scope` argument. The `scope` filter is applied later inside `findShallowCandidates`.
- Output lives under `tmp/`, which is gitignored — the report is working evidence, not committed state.
