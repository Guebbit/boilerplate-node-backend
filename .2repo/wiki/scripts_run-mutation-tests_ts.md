# scripts/run-mutation-tests.ts

## Purpose

A CLI wrapper around `npx stryker run` that adds three capabilities a JSON config cannot provide: injecting machine-specific settings (concurrency, worker heap) from `.env`, clearing the scratch directory before each run, and aborting the process when it detects an OOM/strand loop that will never converge.

## Key elements

- **`main`** (async IIFE) — orchestrates the run: clears `.tmp`, logs resolved settings, spawns `npx stryker run`, monitors stdout for OOM restarts, and exits with the appropriate code.
- **`positiveInteger`** — validates an env-var string into a positive integer or returns `undefined`. Used for `STRYKER_CONCURRENCY` and `STRYKER_WORKER_HEAP_MB`.
- **`wasPassed`** — checks whether an explicit CLI flag (e.g. `--concurrency`) was already supplied, so env-derived values don't override an operator's intent.
- **`strykerArguments`** — the final argument array passed to `npx stryker`, with env-derived flags prepended only when the corresponding CLI flag is absent, followed by any passthrough args.
- **`childEnvironment`** — the env object for the spawned child; sets `NODE_TEST_TMP_BASE` to `.tmp/` and optionally appends `--max-old-space-size` to `NODE_OPTIONS`.
- **OOM detection logic** (inside `stryker.stdout.on('data')`) — counts occurrences of `"ran out of memory"` in forwarded output; if ≥ 6 restarts land within 10 minutes, it prints a diagnostic and sends `SIGTERM`.
- **Constants** — `REPO_ROOT`, `TEST_TMP_BASE` (`.tmp/`, deliberately outside the sandbox), `OOM_LIMIT` (6), `OOM_WINDOW_MS` (10 min).

## Relationships

- **`scripts/mutation-baseline.ts`** — part of the same mutation-testing toolchain. No direct import or call exists between the two files; the relationship is positional (both operate on the same Stryker setup and the same `.tmp/` scratch area). This script is the "run it" entry point; the baseline script is the "record/compare results" counterpart.

## Notes

- **Arg precedence:** explicit CLI flag > `.env` value > `stryker.config.json`. On a CI runner with no `.env`, a workflow's `--concurrency 3` wins unconditionally.
- **`.tmp/` is outside the sandbox** by design so a sweep/cleanup process can find it, and because Stryker kills jest workers mid-run (a killed jest never reaches its own teardown).
- **`--max-old-space-size` is containment, not a fix.** It shortens the runway before a leak surfaces; it does not cure the leak. Left unset, Node sizes the heap from total system RAM, which can mask a leak on large machines.
- **Stdout is piped (not inherited) solely to count OOM lines.** Every chunk is forwarded verbatim to `process.stdout`, so the progress bar and final report render as if unspawned.
- **`process.loadEnvFile()` is wrapped in a try/catch** because CI checkouts typically have no `.env`; the script must still work.
- The docstring references `docs/tools/mutation-testing.md` (section "When a run never finishes") for the OOM-strand-loop diagnosis and remediation steps.
