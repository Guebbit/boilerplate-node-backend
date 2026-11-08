---
source: scripts/testing/run-staged-tests.ts
sha256: aa9eecd2c3c2520457c2989056d88a19f2a5ed04ad3496108f7b85827dff8fa4
generated_at: 2026-11-08T03:03:23.999827+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-staged-tests.ts

## Purpose

Pre-commit gate (last step of `.husky/pre-commit`, invoked as `npm run test:staged`) that runs any staged integration, contract, or fuzz test file not already covered by the lighter `complete:light` suite. Exists because `complete:light` skips all suites that require a `mongod` instance; without this, a newly added or changed integration test would first execute only at merge time.

## Key elements

- **`listed`** — `spawnSync` of `git diff --cached --name-only --diff-filter=AMR -z`; captures the NUL-separated list of added/modified/renamed staged paths.
- **Git-failure guard** — If `git diff` exits non-zero, prints stderr and `process.exit(1)` so the commit is blocked.
- **`files`** — Filters `listed.stdout` (split on `\0`) through `isOutsideLightGate(path)` and an `existsSync` check against `REPO_ROOT`.
- **Early-exit** — If `files` is empty, logs a "no staged integration/contract/fuzz test" message and exits 0.
- **Jest invocation** — `spawnSync('npx', ['jest', '--runInBand', '--passWithNoTests', '--runTestsByPath', ...files])` with `stdio: 'inherit'`; the script's exit code mirrors Jest's status.

## Relationships

- **`scripts/modules-on-disk.ts`** — Provides the `REPO_ROOT` constant used as the working directory for both the `git` and `jest` calls.
- **`scripts/testing/suites.ts`** — Provides `isOutsideLightGate(path)`, the predicate that determines whether a staged test file belongs to a layer the light gate does *not* cover (integration, contract, fuzz).

## Notes

- **Serial execution is mandatory.** The integration/contract/fuzz layers share a single in-memory `mongod`, so Jest runs with `--runInBand`; parallel workers would collide on that instance.
- **`--runTestsByPath` + `testPathIgnorePatterns` interaction.** Paths are passed verbatim (not as regexes), but Jest's `testPathIgnorePatterns` still applies. Staged files under `tests/cluster` or `tests/broker` are silently dropped; `--passWithNoTests` then allows an otherwise-empty run to succeed. Those suites require their own Jest config and live services.
- **NUL-delimited git output (`-z`).** Prevents quoting/whitespace mangling of file paths that contain unusual characters.
- **`--diff-filter=AMR`.** Deliberately excludes deleted files (and copies/unmerged) — a deleted test has nothing to execute.
- **Partial-stage guard.** `existsSync` catches the case where a path appears in the index but the file has been removed from disk (e.g. `git add` followed by `rm` without `git rm`).
