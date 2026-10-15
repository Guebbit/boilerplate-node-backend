---
source: scripts/testing/measure-scaffold.ts
sha256: 40cc145cce4887160e07ba5af1c139af8369c1dbb9a6f2b50dc90845678d539e
generated_at: 2026-10-15T09:48:33.965659+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-scaffold.ts

## Purpose

Report-only integration check (invoked via `npm run measure:scaffold`) that confirms a freshly scaffolded module passes the repo's full quality gate. It copies the checkout to a scratch directory, runs the scaffolder on two probe modules, then executes the same commands a developer would run next (type-check, lint, prettier, unit tests, docs build, cross-cutting rules) inside that copy. Because it takes minutes, it is excluded from the commit gate; run it after touching `scripts/scaffold/` or any shared file the scaffolder edits.

## Key elements

- **`SCRATCH`** – Destination path under `os.tmpdir()` where the full repo copy lives; must be outside the source tree because `fs.cpSync` refuses a destination nested inside its own source.
- **`PROBE` / `QUIET`** – Two module names (`measure-probes`, `quiet-things`) scaffolded into the copy. `PROBE` exercises hyphenated-plural casing; `QUIET` is scaffolded with `--no-audit --group shop --entity QuietThing` to cover the alternate template branch.
- **`FOLDERS`** – Both `src/modules/<name>` paths, reused by the lint, prettier, and jest checks.
- **`Check`** (interface) – Describes one command run: `label`, `command`, `args`, and optional `expectFailure` (a non-zero exit is the *passing* answer).
- **`CHECKS`** – Ordered list of 10 checks: two scaffold invocations, `ts-check`, ESLint, Prettier, Jest on the new modules, `check:docs-graph`, `test:cross-cutting`, `docs:build`, and a final idempotency refusal (`--no-regenerate` on an existing module, `expectFailure: true`).
- **`run(check)`** – Calls `runIn(SCRATCH, …)` and compares the exit code against the expected outcome.
- **`assembleScratchCopy(REPO_ROOT, SCRATCH)`** – Creates the scratch copy (called once before the check loop).
- **Summary / exit** – Prints a `PASS`/`FAIL` line per check, a verdict sentence, and sets `process.exitCode` (0 or 1).

## Relationships

- **`scripts/testing/scratch-copy.ts`** – Supplies `assembleScratchCopy` (creates the full-repo copy) and `runIn` (executes a command inside the scratch directory). All checks in this file run through those two helpers; nothing executes in the live checkout.
- **`scripts/modules-on-disk.ts`** – Supplies `REPO_ROOT`, the absolute path to the repository root that gets copied.

## Notes

- The script uses `process.exitCode` rather than `process.exit()` so that buffered stdout/stderr flushes before the process terminates.
- The last check (`expectFailure: true`) asserts that re-scaffolding the same module with `--no-regenerate` exits non-zero; the `run` helper inverts the comparison accordingly.
- Unit tests under `tests/unit/scripts/scaffold/` cover the pure logic; this script covers only what requires a whole working tree (compilation, lint, docs build, cross-cutting rules).
- Intended as a report for CI or manual use after scaffold changes—not a merge gate.
