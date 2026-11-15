---
source: scripts/audit/code-shape/scripts/generate-shallow-candidates.ts
sha256: d9b559b9dafcb76de2c2bbccae0b9813cf31db2c00aa9abecbf07858328a1f8d
generated_at: 2026-11-14T17:20:24.583525+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/generate-shallow-candidates.ts

## Purpose

CLI entry point for the `code-shape` audit's shallow-candidate pass. It builds a TypeScript program from the repo's `tsconfig.json`, runs the `findShallowCandidates` counting logic over the requested scope, and writes the resulting report to `<out>/shallow.json`. It exists as a separate file from the pure counting module so that unit tests can import `findShallowCandidates` without triggering this script's side effects (arg parsing, FS writes, console output).

## Key elements

- **`DEFAULT_SCOPE`** – Array `['src', 'scripts', 'scenarios', 'tests/support']`; used when the caller supplies no explicit path arguments.
- **`outIndex` / `outDirectory`** – Parses `--out <dir>` from `process.argv`; throws immediately if `--out` is absent.
- **`scopeArguments`** – Remaining argv entries after stripping `--out` and its value; becomes the scan scope if non-empty.
- **`OUTPUT`** – Resolved absolute path `<REPO_ROOT>/<outDirectory>/shallow.json`.
- **`rawConfig` / `parsed` / `program`** – Three-step TypeScript Compiler API setup: read `tsconfig.json` via `ts.readConfigFile`, expand `include` globs into a file list via `ts.parseJsonConfigFileContent`, then build a full program via `ts.createProgram` for import resolution.
- **`report`** – The result of `findShallowCandidates(program, REPO_ROOT, scope)`; contains `smallAndRare`, `passThroughs`, `optionalNeverPassed`, and `lazyFiles` arrays.
- **Write + summary** – `mkdirSync` (recursive) ensures the report folder exists, `writeFileSync` emits pretty-printed JSON, and a `console.log` line prints per-category counts and the relative output path.

## Relationships

- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** – Imported for `findShallowCandidates`, the pure function that actually inspects the program and returns the candidate lists. This file couples that function to a specific program instance and file output.
- **`scripts/modules-on-disk.ts`** – Imported for `REPO_ROOT`, the single source of truth for the repository's absolute root path, used for constructing the output path and resolving the compiler config.

## Notes

- The script is top-level (no `main()` wrapper); all logic runs at module load. Importing it for any reason will execute the full pipeline and write to disk.
- `--out` must be the **first** recognised flag; its value is always the next argv slot. Any other `--flag` tokens are silently treated as scope paths.
- The JSON payload is `{ scope, ...report }` — the `scope` array is embedded so a reader of `shallow.json` can tell which directories were scanned without re-deriving it from the CLI invocation.
- Per the module docstring, this script is governed by `scripts/audit/RULES.md` rules 1 and 4: it writes *only* to the `--out` directory and only to `shallow.json`.
