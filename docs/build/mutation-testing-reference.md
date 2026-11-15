---
type: reference
audience: [developer]
---

# Mutation testing: file map and commands

Part of [Mutation Testing](./mutation-testing.md): every file and command behind a mutation run.

## File map

| Path                                   | Contents                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `stryker.json`                         | Scope (`mutate`), the narrowed Jest config (integration included), thresholds, concurrency, reporters                                           |
| `jest.config.mutation.js`              | The swc transform and `maxWorkers: 1` — see [the worker pool](./mutation-testing-memory.md#the-worker-pool-multiplication)                      |
| `mutation-baseline.json`               | Per-file scores. Committed. The ratchet's memory — see [pending reseed](./mutation-testing-ratchet.md#baseline-status-pending-a-reseed).        |
| `scripts/mutation/stryker-run.ts`      | One Stryker invocation, sized for this machine — concurrency, the heap cap, the scratch sweep, the OOM abort                                    |
| `scripts/mutation/run-diff.ts`         | `npm run mutation` — the files a branch changed, graded against the ratchet                                                                     |
| `scripts/mutation/run-shards.ts`       | `npm run mutation:full` — the whole scope, one shard at a time, resumable, merges once closed                                                   |
| `scripts/mutation/local-policy.ts`     | Which shards a local sweep runs next, given what previous evenings already recorded                                                             |
| `scripts/mutation/mutate-scope.ts`     | The real mutate scope, read off the tree — every `.ts` file `stryker.json` declares mutable                                                     |
| `scripts/mutation/sharding.ts`         | Bin-packing by line count for a local sweep                                                                                                     |
| `scripts/mutation/ci/`                 | The GitHub sweep only — wave planner, slice ignorer, report merge, and the CLI the workflows call                                               |
| `scripts/mutation/baseline.ts`         | Ratchet logic — scoring, comparison, the "never lower" rule, and the merge variant of both                                                      |
| `scripts/mutation/check-baseline.ts`   | CLI for the commands below                                                                                                                      |
| `scripts/mutation/pull-report.ts`      | `npm run mutation:pull` — the newest sweep's report into `tmp/reports/mutation/`, the baseline folded from it                                   |
| `scripts/mutation/github-artifacts.ts` | Which uploaded report that is: the newest unexpired one from a sweep of `main`                                                                  |
| `.github/workflows/mutation.yml`       | Monthly schedule + dispatch, eight waves and the merge job, the PR diff job, the failure issue                                                  |
| `.github/workflows/mutation-wave.yml`  | One wave: plan it, then run its shards as a matrix                                                                                              |
| `tmp/reports/mutation/index.html`      | Human-readable report, drawn from `mutation.json`                                                                                               |
| `tmp/reports/mutation/mutation.json`   | The source: every mutant, per-test results. The ratchet and the audits read it — [which file is what](./mutation-testing.md#which-file-is-what) |

## Commands

| Command                                               | Effect                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run mutation`                                    | The files a branch changed, graded against the ratchet, then laid over the report on disk. `--base=<ref>` to compare against something other than `origin/main`. |
| `npm run mutation:full`                               | The whole scope locally, one shard at a time, resumable across evenings. `--list`, `--limit=n`, `--only=`, `--force`, `--shard-lines=n`.                         |
| `npm run mutation:check`                              | Compare the last report against the per-file baseline. Fails naming what regressed.                                                                              |
| `npm run mutation:check -- --update`                  | Record the last full-scope run (improvements only). Use when `mutate` changed, and say why.                                                                      |
| `npm run mutation:check -- --merge --merge-dir=<dir>` | Fold a sharded sweep's reports into the baseline — see `mutate-scope.ts`'s `readReportsUnder`. What `mutation-merge` runs in CI.                                 |
| `npm run mutation:pull`                               | Download the newest GitHub sweep's report into `tmp/reports/mutation/` and fold `mutation-baseline.json` from it. Needs `gh auth login`. Review, then commit.    |

## Read next

- [Mutation Testing](./mutation-testing.md)
