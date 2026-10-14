---
source: scripts/audit/code-shape/scripts/generate-shallow-candidates.ts
sha256: be0e8406242a3ad19003f036a48276d441764be6f58258860c888cb30f42ab25
generated_at: 2026-10-14T07:07:36.537209+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/generate-shallow-candidates.ts

## Purpose

CLI entry point that runs the code-shape "shallow candidates" audit and writes the result as JSON to `tmp/reports/audit/code-shape/shallow.json`. It exists as a thin side-effect wrapper around `findShallowCandidates` so that unit tests can import the counting logic without triggering the file-write.

## Key elements

- **`DEFAULT_SCOPE`** — `['src', 'scripts', 'scenarios']`; the directories scanned when no CLI path arguments are supplied.
- **`OUTPUT`** — Resolved path under `REPO_ROOT/tmp/reports/audit/code-shape/shallow.json` where the report is written.
- **`rawConfig` / `parsed` / `program`** — Module-level (eager) setup that reads `tsconfig.json`, parses it, and builds a full TypeScript `Program` so the checker can resolve every import in the project.
- **`scope`** — CLI args (`process.argv.slice(2)`) or `DEFAULT_SCOPE`.
- **`report`** — Result of `findShallowCandidates(program, REPO_ROOT, scope)`; contains `smallAndRare`, `passThroughs`, `optionalNeverPassed`, and `lazyFiles` lists.
- **Main flow** — Creates the output directory, writes pretty-printed JSON (`{ scope, ...report }`), and logs a one-line summary to stdout.

## Relationships

- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** — Source of `findShallowCandidates`, the pure counting function. This file is the only consumer that pairs it with I/O.
- **`scripts/git-base.ts`** — Provides `REPO_ROOT`, used to anchor `tsconfig.json` lookup, `parsed` resolution, and the `OUTPUT` path.

## Notes

- **Side-effectful by design.** Importing this module runs the audit and writes the file. Tests must import `shallow-candidates.ts` directly, never this file.
- **Eager program build.** `ts.createProgram` runs at module load, not inside a function. There is no exported function to call; the entire body is top-level.
- **Invocation:** `npm run audit:shallow -- [path...]` via the `tsx` shebang; not intended to be `require`d or `import`ed as a library.
