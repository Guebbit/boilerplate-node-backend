---
source: scripts/testing/measure-scaffold.ts
sha256: c736917fe7b332f9938481bf5880ec8606492c66ae90d0ed7adce59c5124ea91
generated_at: 2026-11-08T03:02:52.061382+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-scaffold.ts

## Purpose

End-to-end verification script (invoked via `npm run measure:scaffold`) that confirms a freshly scaffolded module passes the repo's own quality gates. It copies the checkout to a scratch directory, scaffolds two probe modules there, then runs the same checks a developer would run immediately after scaffolding (type-check, lint, format, unit tests, docs build, idempotency refusal). Report-only by design — it takes minutes and is not wired into the commit gate. Run it after changing anything under `scripts/scaffold/` or a shared file the scaffolder edits.

## Key elements

- **`SCRATCH`** – Fixed path under `os.tmpdir()` (`scaffold-measure`) where the scratch copy lives. Chosen outside the checkout because `fs.cpSync` refuses a destination inside its own source.
- **`PROBE` / `QUIET`** – Names of the two probe modules scaffolded in the copy. `measure-probes` exercises default flags; `quiet-things` exercises `--no-audit --group shop --entity QuietThing` so the alternate templates are compiled too.
- **`FOLDERS`** – Derived list of `src/modules/<name>` paths, reused by lint, prettier, and jest checks.
- **`Check` interface** – Describes a single command to run in the scratch tree: label, command, args, and optional `expectFailure` (a non-zero exit is the *passing* answer, used for the idempotent-refusal check).
- **`CHECKS`** – Ordered array of 10 checks: two scaffold invocations, `ts-check`, eslint, prettier, jest on the modules, module-graph freshness, `test:cross-cutting`, `docs:build`, and a second scaffold that must be refused.
- **`run(check)`** – Executes one `Check` in the scratch directory via `runIn` and compares the exit code against the expected outcome.
- **Top-level flow** – `assembleScratchCopy` → map `CHECKS` through `run` → print a PASS/FAIL summary line per check → set `process.exitCode`.

## Relationships

- **`scripts/testing/scratch-copy.ts`** – Provides `assembleScratchCopy` (copies the repo into `SCRATCH`) and `run` (executes a command in the scratch directory). This file is its consumer; no other caller is visible here.
- **`scripts/modules-on-disk.ts`** – Supplies `REPO_ROOT`, the absolute path to the checkout root, which is passed as the source to `assembleScratchCopy`.

## Notes

- Uses `process.exitCode` (not `process.exit()`) so that `console.info` output is guaranteed to flush before the process terminates.
- The idempotency check (`a second scaffold is refused`) sets `expectFailure: true`; the `run` helper inverts the comparison so a non-zero exit is treated as *passing*.
- The script is explicitly **not** a merge gate. It is intended for manual/CI-after-change runs (e.g., after editing `scripts/scaffold/`, the roles YAML, the conformance fixture, or the parity canary).
- Unit tests under `tests/unit/scripts/scaffold/` cover the pure-logic half; this script covers what only a whole checkout can verify (compilation, lint, docs build, cross-cutting rules). See `docs/tools/module-scaffolder.md` for the broader scaffolder documentation.
