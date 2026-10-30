---
source: scripts/testing/measure-scaffold.ts
sha256: c736917fe7b332f9938481bf5880ec8606492c66ae90d0ed7adce59c5124ea91
generated_at: 2026-10-29T01:45:39.269540+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-scaffold.ts

## Purpose

Report-only integration check that answers: "does a freshly scaffolded module pass the repo's own gate?" It copies the checkout to a temp scratch directory, scaffolds two probe modules (exercising both default and `--no-audit` flag paths), then runs the full developer pipeline—type-check, lint, format check, unit tests, module-graph freshness, cross-cutting tests, and docs build—and prints a PASS/FAIL summary. It takes minutes and is intentionally excluded from the commit gate; run it manually after touching `scripts/scaffold/` or any shared file the scaffolder edits.

## Key elements

- **`SCRATCH`** – Destination under `os.tmpdir()` (`scaffold-measure`). Lives outside the source tree because `fs.cpSync` refuses a destination nested inside its own source.
- **`PROBE` / `QUIET`** – Two module names (`measure-probes`, `quiet-things`) so both template branches (with and without `--no-audit`, `--group`, `--entity`) are exercised.
- **`Check`** (interface) – Describes one command: `label`, `command`, `args`, and optional `expectFailure` (a non-zero exit *is* the passing answer, used for the idempotent-refusal check).
- **`CHECKS`** – Ordered list of 10 checks: two scaffold invocations, `ts-check`, eslint, prettier, jest, module-graph `--check`, `test:cross-cutting`, `docs:build`, and a repeat-scaffold refusal.
- **`run(check)`** – Executes a single check via `runIn` and returns whether the exit code matches expectation.
- **Main flow** – `assembleScratchCopy(REPO_ROOT, SCRATCH)` → map `CHECKS` through `run` → print summary → set `process.exitCode`.

## Relationships

- **`scripts/testing/scratch-copy.ts`** – Provides `assembleScratchCopy` (creates the temp copy of the repo) and `runIn` (spawns a command inside that scratch directory). All checks execute there, never in the live checkout.
- **`scripts/modules-on-disk.ts`** – Provides `REPO_ROOT`, the canonical path to the checkout used as the source for the scratch copy.

## Notes

- **Not a gate.** CI runs it report-only; the exit code is informational, not a merge blocker. The doc comment and the final `console.info` both state this explicitly.
- **`process.exitCode` vs `process.exit()`.** The script sets `process.exitCode` rather than calling `exit()` so pending stdout/stderr from child processes can flush before the process terminates.
- **`expectFailure` semantics.** For the "second scaffold is refused" check, a non-zero exit means success. The `run` helper inverts the comparison accordingly.
- **Division of labor with unit tests.** Pure logic under `tests/unit/scripts/scaffold/` covers the scaffolder's transformations; this script covers what only a whole checkout can validate (compilation, lint, generated tests, docs).
