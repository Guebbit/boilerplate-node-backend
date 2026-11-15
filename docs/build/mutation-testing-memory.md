---
type: concept
audience: [developer]
---

# Mutation testing: memory and workers

Part of [Mutation Testing](./mutation-testing.md): the worker pool, per-file setup costs, and the out-of-memory loop.

## The worker-pool multiplication {#the-worker-pool-multiplication}

`jest.config.mutation.js` pins `maxWorkers: 1`, and that single line is worth roughly an order of
magnitude on this machine.

`jest.config.js` sizes its pool for a STANDALONE run: one jest process, a fixed default of 2
workers when `JEST_WORKERS` is unset (the fallback for a direct `npx jest`, documented in that
file — `npm run test:*` sizes itself through `scripts/testing/machine-budget.ts` instead).
`jest.config.mutation.js` spreads the base config, so before this it inherited that number — and
under Stryker the number is multiplied rather than reused. Stryker runs `concurrency` test runners
at once, each of which is a full jest with a full pool of its own. On a 32-core box that was four
runners times thirty workers, back when the fallback was itself computed from core count.

What it looks like when it is wrong: **load average 31.8 on 32 cores, and roughly 55 seconds per
mutant against a suite that runs 703 tests in 78 seconds single-threaded.** The run is not blocked
on anything; it is context-switching. Nothing errors, and the progress bar's remaining-time
estimate stays plausible, which is what makes it survivable for a long time.

There is nothing for a pool to do here in any case. `coverageAnalysis: "perTest"` narrows each
mutant to the tests that actually reach it — usually a handful, in one or two files — and a jest
pool cannot parallelise below a file. **The parallelism belongs to Stryker, which spends it on
mutants.** `STRYKER_CONCURRENCY` in `.env` is the one knob worth turning; `JEST_WORKERS` governs
`npm test` and should not be reaching this run at all.

It also fixes the memory arithmetic in `jest.config.js`'s own comment: peak RSS is measured per
worker, and four runners each holding a thirty-worker pool is not a budget anyone sized.

Related, and found the same way: `ignorePatterns` now lists `tmp/**`. That covers the in-memory
mongod data directories under `tmp/test/`, which are live files being written by a running jest
while Stryker copies the project into its sandbox — so copying them is both pointless (every jest
instance starts its own server) and racy. A WiredTiger file removed mid-copy fails the entire run
with an `ENOENT` naming a filename nothing in the project mentions. `scripts/mutation/stryker-run.ts`
clears its own scratch root, `tmp/test-mutation`, before it starts (a plain `npm test`'s `tmp/test` is left alone), which hid this until two runs overlapped.

`ignorePatterns` also lists `.claude/**` — Claude Code's local state, mostly untracked: the whole
worktree checkouts it creates there exist only on a developer's machine, which is why CI never hits
what they cause. Stryker's sandbox copy is a plain `copyfile`, so a symlinked directory
in there aborts the whole run with `EISDIR` before a single mutant is instrumented. The one tracked
part, `.claude/skills/`, is pointer files no test reads (see [AI Auditing](./ai-auditing.md)).

The rule the two share: a directory the suite does not read belongs here — the sandbox needs what the TESTS read, not what the repository happens to contain.

`ignorePatterns` must **not** list `public/**`, even though `tmp/`, `dist/` and
`docs/` are all excluded there — the sandbox is the only filesystem the tests see, and
`tests/unit/scenarios/scenario-images.test.ts` asserts every seed row's `imageUrl` resolves to a
committed file under `public/images/seed/`. Leave it out of `ignorePatterns` and Stryker refuses to
start at all.

## What to be wary of — per-file setup costs {#per-file-setup-costs}

Mutation testing multiplies whatever the suite does on setup by the mutant count. A cost that is
invisible at `npm test` becomes the whole run here.

The worked example, measured 2026-08-14. `setupTestDb()` runs in `beforeAll`, so it fired once per
test FILE — and it used to start a `MongoMemoryServer` each time:

|                    | per pass   | per run           |
| ------------------ | ---------- | ----------------- |
| `npm test`         | 33 servers | 33                |
| `npm run mutation` | 33 servers | 33 × 6042 mutants |

Each server is a real `mongod` plus ~200 MB of dbpath and ~1 MB of driver buffers. Under `npm test`
the process exits and takes them; under Stryker the worker persists across mutants, so the buffers
accumulated to 1.08 GB — 45% of the heap — and the run stopped converging. Starting **one** server
per jest instance and giving each file its own DATABASE fixed it without touching a single test.

**The rule:** anything in `beforeAll` is paid once per file per mutant. Before adding a server, a
container, a browser or a fixture build there, ask what it costs multiplied by the mutant count —
and prefer one shared instance with per-file isolation over one instance per file.

**How to spot it:** run the suite outside Stryker first (`npx jest <scope> --runInBand`). If it is
fast and light there but heavy under mutation, the difference is setup being repeated, not your
tests being slow.

## Where the out-of-memory story went

The long sections moved to sub-pages; each heading below keeps its old link target.

### Case study: the buffers were not I/O at all {#case-study-the-buffers-were-not-io-at-all}

Moved: [Case study: the buffers were not I/O at all](./mutation-testing-oom-case-study.md#case-study-the-buffers-were-not-io-at-all).

### Related: the same arithmetic kills a plain `npm test` {#jest-worker-count}

Moved: [Related: the same arithmetic kills a plain `npm test`](./mutation-testing-oom-case-study.md#jest-worker-count).

### The heap cap — unset is not "as much as the machine has" {#worker-heap-cap}

Moved: [The heap cap — unset is not "as much as the machine has"](./mutation-testing-oom-case-study.md#worker-heap-cap).

## One process per dry run — why a file must free its memory {#one-process-per-dry-run}

Stryker's jest runner forces `runInBand: true`. The dry run therefore executes every related test
file inside ONE process, and `workerIdleMemoryLimit` never gets a worker to recycle. Whatever a
file leaves reachable, the next hundred files add to.

What made files leave everything reachable: a callback still registered with Node when the file
ended. Its closure belongs to the file's VM context, so the whole context stays alive with it.

```mermaid
flowchart LR
    Node["Node's timer list /<br/>perf_hooks observer set"] --> CB["callback created<br/>inside the test file"]
    CB --> Ctx["the file's VM context"]
    Ctx --> Graph["app, models, Mongoose,<br/>every module the file loaded"]
```

| Who registered it                     | What                       | Never released because       |
| ------------------------------------- | -------------------------- | ---------------------------- |
| `express-rate-limit`'s MemoryStore    | an interval per limiter    | nothing calls `shutdown()`   |
| prom-client's `collectDefaultMetrics` | a GC `PerformanceObserver` | nothing calls `disconnect()` |

Measured 2026-09-21, shard-30's 117 related files in band at a 4 GB heap: 35–80 MB retained per
file, `Ineffective mark-compacts near heap limit` around file 64 — with or without Stryker, at any
concurrency. A plain `npm test` never shows it: its workers are recycled.

**The fix** is `tests/support/test-environment.ts`, the `testEnvironment` of every jest config. It
tracks the timers and observers a file starts and clears the survivors at teardown. The same run
then held 220–620 MB from the first file to the last.

**Finding the next one**, if the heap climbs again: `npx jest -c jest.config.mutation.js
--runInBand --logHeapUsage <files>`, then a heap snapshot after two files. Count a per-file
object (`Mongoose` works) and walk its retainer path to a GC root — the root names the culprit.

### Stryker's coverage records, and collecting after each file {#collect-after-each-file}

Clearing timers was not enough: on 2026-10-04 the sweep's `preflight` still died after 13 minutes
at a 12 GB heap, and a parallel variant at Node's default heap lost 208 of 210 shards the same way.
Two more things kept finished files in memory, and both happen only under Stryker.

| Cause                          | What happens                                                                                                                                                                                                                                                                                   | Fix in `tests/support/test-environment.ts`                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Stryker's coverage records** | Stryker shares one namespace object across every file. With `coverageAnalysis: perTest`, its instrumented code creates a `{}` per covering test _inside_ the file's VM context — and an object keeps its whole context alive. Every file that exercised the mutated code stayed: ~420 MB each. | At teardown, copy those records into the environment's own realm (`releaseStrykerCoverage`). Same data, nothing pointing into the file. |
| **Lazy collection**            | V8 frees a finished file's context lazily. In one process the next files outrun it, and V8 throws "heap out of memory" with the memory still reclaimable — [known jest behaviour](https://github.com/jestjs/jest/issues/11956).                                                                | At teardown, call `gc()` when `--expose-gc` made it available.                                                                          |

Measured 2026-10-07, heap after each file of Stryker's initial run (`--dryRunOnly`):

| Mutated file (related test files) | Heap cap | Neither fix              | Collection only                          | Both                             |
| --------------------------------- | -------- | ------------------------ | ---------------------------------------- | -------------------------------- |
| `tasks/model.ts` (124)            | 4 GB     | out of memory by file 23 | finished, 0.6–3.2 GB                     | —                                |
| `users/model.ts` (205)            | 8 GB     | out of memory            | out of memory by file 27, +420 MB a file | finished, levels off near 4.4 GB |

The first row hid the first cause: few of `tasks`'s test files run its model during a test, so few
records were made. `users/model.ts` is exercised by nearly every test file, so nearly every file
stayed. A plain `jest --runInBand` shows neither: there is no Stryker namespace, and with
`--logHeapUsage` plus `--expose-gc` jest collects after each file itself.

Who sets `--expose-gc`:

- `scripts/mutation/stryker-run.ts` — the local runs and the PR diff job.
- `NODE_OPTIONS` in `mutation.yml`'s `preflight` and `mutation-wave.yml`'s shards.

A normal test run sets neither the flag nor the namespace, so it pays nothing.

### The `bson` warning sign {#the-bson-warning-sign}

`bson` is not a leak on its own. It is the **amplifier** that makes any other leak expensive, and
the first thing a memory dump shows — which is why it was blamed for a month.

|                            |                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **What it does**           | reserves a 17 MiB scratch buffer at module scope, every time the module is evaluated ([`src/bson.ts`](https://github.com/mongodb/js-bson/blob/main/src/bson.ts)) <!-- doc-paths:ignore --> |
| **When that is harmless**  | on its own, always: jest evaluates it once per test FILE, and the buffer is freed with the file                                                                                            |
| **When it becomes a leak** | a test file stays reachable after it ends — then its 17 MiB stays too, and the next file adds another                                                                                      |
| **Why it hides**           | the buffer is an `ArrayBuffer`, outside V8's heap: `--max-old-space-size` never sees it, and `heapUsed` never counts it                                                                    |
| **How it shows**           | `process.memoryUsage().arrayBuffers` climbing ~17 MiB per test file; a heap dump dominated by ~17 MB buffers                                                                               |

Measured 2026-09-21, 40 test files in one process, `arrayBuffers` after each:

| after file | files retained (before the fix) | files freed (after) |
| ---------- | ------------------------------- | ------------------- |
| 1          | 38 MB                           | 38 MB               |
| 10         | 195 MB                          | 36 MB               |
| 20         | 390 MB                          | 53 MB               |
| 40         | 726 MB, still climbing          | 71 MB, flat         |

**If you see it:** do not look at `bson`. Look for what keeps old test files alive — walk a heap
snapshot's retainer path from one of the buffers **all the way to a GC root**, not just to the
module that owns it. The root names the real culprit: in 2026-09 a timer and a performance
observer; next time perhaps an event listener on a shared object, or a global registry.

## The dry run's own timeout

`stryker.json` sets `dryRunTimeoutMinutes: 20`. It used not to set it at all, which left Stryker's
default of 5 minutes in force — and the dry run executes the WHOLE suite once, unconditionally,
before a single mutant runs, to build the coverage map `coverageAnalysis: perTest` needs. Under the
old three-night rotation, three or four shards lost that coin flip on ordinary nights, timing out at
340–360 seconds with nothing to show for it. 20 minutes is a flat setup-cost budget against a job
measured in hours; it hides nothing, unlike narrowing what the dry run has to execute would.

## Concurrency and maxTestRunnerReuse — the current numbers {#concurrency-and-reuse}

Both are measurements with an expiry date, not constants — re-measure them when the numbers below stop matching the machine or the project.

**`concurrency: 4`.** The ceiling is memory, not cores: each worker is a separate process carrying a full test runner and its own in-memory `mongod`, and the machine is in use while a run happens. It was 8, and 8 stopped fitting: measured 2026-08-14, under the old unit-only ruler, a run at 8 held four workers at ~4 GB RSS each, logged 12 `ran out of memory` worker restarts in the first five minutes, and then made no progress at all — 1927 of 6040 mutants after five minutes, and the same 1927 three samples later. A run that thrashes does not merely take longer, it stops finishing.

What moved was the project, not the machine: the module count went from nine to thirteen and the mutant count from 3241 to 6040 between those two measurements, so the same 8 workers each carried a much larger program. `maxTestRunnerReuse` (below) has since removed the _unbounded_ growth that made 8 fail, so that specific failure no longer applies — but what bounded a worker under that ruler was the working set of one pass, ~2.9 GB, which does not shrink with more recycling. Divide usable RAM by ~3 GB: 8 in principle, 6 in practice on 32 cores / 30.5 GB, because 8 left only 1.6 GB free on a machine doing other things.

**That ~2.9 GB figure predates the ruler merge** — it was measured under the old unit-only config, whose worker never opened a database. `stryker.json` now runs `tests/integration/` in every worker, which starts a real in-memory `mongod` per file, so the true working set per worker today is almost certainly higher. `STRYKER_WORKER_PEAK_MB` in `scripts/mutation/stryker-run.ts` (the constant `resolveConcurrency()` divides free RAM by) still reads `2900` — **it has not been re-measured against the merged ruler.** Until it is, `resolveConcurrency()` on an unconfigured machine may pick a concurrency a little more aggressive than the box can actually sustain; the OOM-loop guard below still catches the consequence (a run that will not converge) rather than letting it burn silently, but it costs restarts to find that out. Re-measure the same way as before — `npx stryker run --mutate <one file> --concurrency 1`, watching RSS — and update both this paragraph and the constant together.

4 is kept as the shared default because this value is committed and the safe number is a property of the machine, not the project — a contributor's laptop is not a 30 GB desktop. Raise it per machine via `STRYKER_CONCURRENCY` in `.env` (see [the worker-pool multiplication](#the-worker-pool-multiplication)). CI overrides it independently — the GitHub sweep passes `--concurrency 1` with a 12 GB heap, because a standard runner is 4 vCPU / 16 GB, not 32/30 ([The GitHub sweep](./mutation-testing-running.md#the-github-sweep)).

**`maxTestRunnerReuse: 1`** restarts the test runner after every mutant. It was set because memory
climbed from mutant to mutant — measured at reuse 5: **23 OOM restarts on one file**; at 1: **0**,
and half the time.

That climb was [old test files kept alive](#one-process-per-dry-run), each holding
[`bson`'s 17 MiB](#the-bson-warning-sign) — fixed 2026-09-21. **Reuse 1 is therefore probably no
longer needed**, while every restart costs a fresh process, jest and `mongod` per mutant. Not yet
re-measured: raise it (3, then 2 if that fails) only after checking RSS stays flat across mutants:

```bash
npx stryker run --mutate <one file> --concurrency 1
```

watching RSS against the mutant counter.

## Read next

- [Mutation testing: when a run never finishes](./mutation-testing-oom.md)

- [Mutation Testing](./mutation-testing.md) — the hub
- [Coverage & Confidence](./coverage-and-confidence.md)
