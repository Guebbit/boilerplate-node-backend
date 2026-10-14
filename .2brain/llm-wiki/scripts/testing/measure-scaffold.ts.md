---
source: scripts/testing/measure-scaffold.ts
sha256: 5e934dda0708c1fabd2cc01fd0a14d11c030b1a1d896a75d6bbfbcf54582b9d0
generated_at: 2026-10-14T14:33:46.168284+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-scaffold.ts

## Purpose

Report-only integration check that verifies a freshly scaffolded module passes the repo's own quality gates (type-check, lint, prettier, unit tests, cross-cutting tests, docs build, idempotency). It runs entirely in a scratch copy of the repo so the real checkout is never mutated. Because it takes minutes, it is excluded from the commit gate; run it manually after touching `scripts/scaffold/` or a shared file the scaffolder edits.

## Key elements

- **`PROBE` / `QUIET`** – two module names scaffolded in the copy; `PROBE` (`measure-probes`) exercises hyphenated-plural casing, `QUIET` (`quiet-things`) exercises the `--no-audit`, `--group`, and `--entity` switches.
- **`CHECKS: readonly Check[]`** – ordered list of every command to run in the scratch tree, from the two scaffold invocations through ts-check, eslint, prettier, jest, docs-graph, cross-cutting tests, docs build, and finally an idempotency refusal (`--no-regenerate` expecting a non-zero exit).
- **`Check` interface** – `label`, `command`, `args`, and optional `expectFailure` (true when a non-zero exit is the *passing* answer).
- **`run(check)`** – delegates to `runIn` from `scratch-copy.ts`; compares exit status against the expected value and logs a one-line result.
- **`assembleScratchCopy(REPO_ROOT, SCRATCH)`** – copies the entire repo into `SCRATCH` before any check runs.
- **Exit handling** – sets `process.exitCode` (not `process.exit()`) so pending stdout flushes; CI treats this as report-only.

## Relationships

- **`scripts/testing/scratch-copy.ts`** – provides `assembleScratchCopy` (copies the repo into a temp directory) and `runIn` (executes a command with `cwd` set to the scratch root). This file is the sole consumer of both in this script.

## Notes

- `SCRATCH` lives under `os.tmpdir()` specifically because `fs.cpSync` refuses a destination inside its own source tree.
- The last check (`a second scaffold is refused`) uses `expectFailure: true`; a *non-zero* exit is the correct answer there.
- Unit tests under `tests/unit/scripts/scaffold/` cover the pure-logic half of the scaffolder; this script covers what only a whole checkout can verify (generated code compiles, lints, its tests pass, no cross-cutting violations, docs build).
- The lint check targets both module folders *plus* `src/modules.ts` and `tests/cross-cutting` to catch registration and cross-cutting rule regressions.
- See `docs/tools/module-scaffolder.md` for the broader scaffolder contract.
