---
source: scripts/testing/run-staged-tests.ts
source_sha256: c0389674940849eb5ff35cb25586330abd1c5216d647415be99b98a9e7bd57a3
context_sha256: 2471b04d47e12dca4a007c5d7d452bd744631d3063abf6ceff07d71c93229561
generated_at: 2026-11-22T02:19:41.125850+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/run-staged-tests.ts

## Purpose
A pre-commit script (`npm run test:staged`, the last step of `.husky/pre-commit`) that runs, file by file, the integration, contract and fuzz tests that the commit adds or changes. The light gate (`complete:light:gates`) skips every suite that needs `mongod`, so without this step a new integration test would first run at merge time, far from the commit that broke it.

## Key elements
This is a top-level script with no exports. It runs in order:
- **Staged file listing**: `spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=AMR', '-z'])` in `REPO_ROOT`. NUL-separated output avoids filename quoting problems. Only added, modified and renamed files are kept, since a deleted test has nothing left to run.
- **Failure handling**: if `git diff` exits non-zero, it logs the stderr and exits 1, so a git failure fails the commit instead of reading as "nothing staged".
- **Filtering**: `files` keeps paths where `isOutsideLightGate(path)` is true and the file still exists on disk (a partial stage can drop one).
- **Early exit**: if `files` is empty, it logs `[test:staged] no staged integration/contract/fuzz test` and exits 0.
- **Jest run**: `npx jest --runInBand --passWithNoTests --runTestsByPath ...files` with inherited stdio. The script exits with jest's status, or 1 if there is none.

## Relationships
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, used as the working directory for both `git` and `jest` and to resolve staged paths on disk.
- `scripts/testing/suites.ts`: provides `isOutsideLightGate`, which decides which staged files this script runs.

## Notes
- `--runInBand` is used because these layers share one in-memory mongod, so their files must not run in parallel.
- `--runTestsByPath` takes exact paths, not regexes, and still honours `testPathIgnorePatterns`. A staged `tests/replicas` or `tests/broker` file is dropped, and `--passWithNoTests` lets the resulting empty run pass. Those suites need their own config and real services.
