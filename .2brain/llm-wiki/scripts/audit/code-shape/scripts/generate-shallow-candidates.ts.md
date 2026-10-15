---
source: scripts/audit/code-shape/scripts/generate-shallow-candidates.ts
sha256: fa510bc08c61eb2227ed9a04a16d97e35c900616e37216a7bafb8a892ae27db6
generated_at: 2026-10-15T09:34:39.328854+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/generate-shallow-candidates.ts

## Purpose

CLI entry point that runs the `code-shape` shallow-candidates audit and writes the resulting JSON report to `tmp/reports/audit/code-shape/shallow.json`. It is deliberately split out from the pure counting logic so that the sibling module's unit tests can import `findShallowCandidates` without triggering filesystem writes or `process.argv` side effects.

## Key elements

- **`DEFAULT_SCOPE`** — `['src', 'scripts', 'scenarios']`; the directories scanned when no CLI paths are supplied.
- **`OUTPUT`** — Absolute path to the JSON report, derived from `REPO_ROOT`.
- **`rawConfig` / `parsed` / `program`** — TypeScript compiler-API bootstrap: reads `tsconfig.json`, resolves its `include` globs, and builds a full `ts.Program` so every import can be resolved during analysis.
- **`scope`** — CLI arguments (`process.argv.slice(2)`) or `DEFAULT_SCOPE`.
- **`report`** — The object returned by `findShallowCandidates(program, REPO_ROOT, scope)`, containing the four candidate lists: `smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`.
- **Final block** — Creates the output directory, writes the JSON (scope + report), and logs a one-line summary with counts and the relative output path.

## Relationships

- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** — Imports the pure `findShallowCandidates` function. This file is the *only* caller of that function in the repo; the sibling file contains no I/O.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`, which anchors all path resolution (tsconfig read, output path, scope-relative comparisons).

## Notes

- Runs via `npm run audit:shallow -- [path…]`; the paths are repo-relative prefixes, not globs.
- The output lives under `tmp/` and is expected to be gitignored (working evidence, not committed artifact).
- Because a full `ts.Program` is built at module scope, this script is expensive to import; never import it from test code — import `shallow-candidates.ts` directly instead.
- The `tsconfig.json` `include` globs determine which files enter the program; files outside those globs but inside the `scope` directories will still be analyzed (scope filters the *report*), but their imports won't resolve through the program.
