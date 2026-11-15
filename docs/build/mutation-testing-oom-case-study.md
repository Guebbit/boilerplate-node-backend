---
type: concept
audience: [developer]
---

# Mutation testing: the buffers case study and the fix

Part of [Mutation testing: when a run never finishes](./mutation-testing-oom.md): the case study, the jest worker arithmetic, the fix, and the heap cap.

### Case study: the buffers were not I/O at all {#case-study-the-buffers-were-not-io-at-all}

A short account of a four-hypothesis investigation, kept because the wrong turns are the reusable
part. Measured 2026-08-14 on a 16-core / 30 GB machine.

**The symptom.** `npm run mutation:full` grew until Node killed the worker, restarted it having
finished nothing, and reported a remaining time that climbed rather than fell — 36 hours after 90
minutes at 3%. A heap dump said half the process was ~1000 raw binary buffers of about a megabyte
each.

**The three hypotheses that were wrong.** Each was plausible, each improved the symptom, and none was
the cause — which is precisely why "it got better" is not a diagnosis:

| Hypothesis                  | What was built                        | What happened                                              |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| ts-jest's type-check cache  | swapped the transform to swc          | suite got ~2× faster; growth continued                     |
| a `mongod` started per file | one shared server for the whole run   | 88 GB of stranded data directories fixed; growth continued |
| per-file mongoose connects  | planned: share one socket via `useDb` | never built — the measurement below killed it              |

All three shared one unexamined premise: that megabyte-sized buffers must be I/O. They looked like
network buffers, so the search stayed inside the database stack for hours.

**The measurement that broke it.** The premise is testable in one line of reasoning: if the buffers
come from database connections, running fewer database suites must leave fewer buffers. So the same
run was taken three times — with all 37 database-backed suites, with 10, and with none — every
reading at the identical point (end of the dry run, one full suite pass), under a cap high enough
that no worker restarted mid-measurement:

| database-backed suites | buffers | buffer bytes | heap total |
| ---------------------- | ------- | ------------ | ---------- |
| 37                     | 431     | 511.6 MB     | 1251.6 MB  |
| 10                     | 430     | 511.5 MB     | 1225.4 MB  |
| 0                      | 423     | 511.1 MB     | 1220.0 MB  |

Removing **every** database suite changed the buffer count by 8 and the bytes by 0.5 MB. Repeated
five mutants into the mutation phase the curve is not merely flat but non-monotonic — 1329 buffers
with no database against 1185 with all of them. There is no relationship to connections in either
phase, and the `useDb` work would have been a week spent on 0.1% of the problem.

**What they actually were.** A heap snapshot forces a full GC before it is written, so everything in
one is genuinely reachable rather than merely uncollected. Walking the reference graph _backwards_
from the buffers — grouping by kind alone cannot do this, since it aggregates nodes and never
reads edges — named the owner immediately:

```
1326.0 MB   78   ArrayBuffer .backing_store  <-  Buffer .buffer  <-  system / Context .buffer
```

78 buffers, 95% of all buffer bytes, **17.0 MB each**, held by a variable named `buffer` in a module
scope. That is `node_modules/bson/lib/bson.cjs`, compiled from upstream
[`src/bson.ts`](https://github.com/mongodb/js-bson/blob/main/src/bson.ts): <!-- doc-paths:ignore -->

```js
const MAXSIZE = 1024 * 1024 * 17;
let buffer = ByteUtils.allocate(MAXSIZE); // allocated on every evaluation of the module
```

`bson` reserves a 17 MiB scratch buffer the moment it is loaded — enough for MongoDB's 16 MiB
document ceiling. Jest gives every test **file** a fresh module registry, because that is what test
isolation means, so every file that reaches mongoose evaluates `bson` again and pays 17 MiB again. A
normal `npm test` never notices: files run in worker processes that exit and return the memory.
Stryker does not exit — it runs the suite once per mutant inside one long-lived worker — so the
copies accumulate, roughly ten per mutant.

**Why every earlier fix missed it.** The buffer belongs to the library that _encodes_ documents, not
to any connection: it is allocated at import time, before a connection exists and whether or not one
ever does. Sharing a server could not touch it, sharing a connection could not either, and removing
the database suites did not — because unit tests still import models, models import mongoose, and
mongoose imports bson.

**Why the heap cap never contained it.** `--max-old-space-size` bounds V8's old space.
`ArrayBuffer` backing stores are external to it, so V8 sees a comfortable heap, feels no pressure to
collect, and the process grows regardless: a worker capped at 1400 MB was measured at 6.6 GB RSS.
The cap only ever decided _when_ the worker died, never _whether_ it grew.

**What this investigation missed — found 2026-09-21.** The retainer walk above stopped at
`system / Context .buffer`: `bson`'s own module scope. One step further, to the GC root, would have
shown why that scope was still alive: a timer from `express-rate-limit` and an observer from
`prom-client`, each pinning its test file's whole context. The buffers piled up because the files
were never freed — not because Stryker's worker never exits. Fixed in
`tests/support/test-environment.ts`; see [One process per dry run](./mutation-testing-memory.md#one-process-per-dry-run) and
[the `bson` warning sign](./mutation-testing-memory.md#the-bson-warning-sign). No upstream report against `bson` is needed:
freeing the file frees its buffer.

The former is not a workaround invented under pressure — it is Stryker's own sanctioned answer to a
dependency holding module-scope state a reused worker can't shed.
[stryker-mutator/stryker-js#2922](https://github.com/stryker-mutator/stryker-js/issues/2922)
documents the same class of problem for native ESM (a reused worker can't reset a module's state
between mutants, since Node has no `require.cache` equivalent for ESM) and prescribes
`maxTestRunnerReuse: 1` as the fix. [The option's own docs](https://stryker-mutator.io/docs/stryker-js/configuration/#maxtestrunnerreuse-number)
frame it the same way: _"Not recommended unless you are experiencing memory leaks that you are
unable to resolve"_ — this is that case, not a special one.

**The lever that looks right and is not.** Jest's `workerIdleMemoryLimit` recycles a worker once it
passes a memory bound, which is the plain-jest analogue of `maxTestRunnerReuse` and the first thing
anyone reaches for here. It cannot work for this leak, for the same reason `--max-old-space-size`
could not: the child reports `process.memoryUsage().heapUsed` and nothing else —
`node_modules/jest-worker/build/processChild.js`, one line — so the bound is measured against the
one number that excludes `ArrayBuffer` backing stores. A worker holding 78 copies of a 17 MiB
buffer looks small to it. Checked 2026-08-15, jest 30; check it again rather than assuming, but do
not spend a day rediscovering it.

**The rule this earns.** Group-by tells you _what_ is in a heap; only the edges tell you _who holds
it_. Identifying a kind of object and then guessing its owner from what that kind is usually for is
not a diagnosis — it is the same guess with a number attached to it. And follow the edges all the
way to a GC root: stopping at the first owner found (here, `bson`'s module scope) names the victim,
not the culprit.

### Related: the same arithmetic kills a plain `npm test` {#jest-worker-count}

Stryker is where the accumulation becomes unbounded, but the per-worker cost exists in an ordinary
run too, and it is enough on its own. A worker peaks at 772–905 MB here; jest's default worker count
is `logical CPUs - 1`, which on a 16-core/32-thread machine is 31 of them. Measured 2026-08-15 over
the 98 unit suites:

| workers | wall | peak RSS |
| ------- | ---- | -------- |
| 31      | 20s  | 17.6 GB  |
| 12      | 14s  | 9.0 GB   |
| 8       | 13s  | 6.3 GB   |

At 17.6 GB on a 30.5 GB machine that also runs the docker stack, the OOM killer takes two workers
and jest reports `A jest worker process was terminated by another process: signal=SIGKILL` while
every test passes — a message that names the symptom and nothing else.

Note that eight workers were **faster** than thirty-one: past the point where the machine can hold
them, extra workers buy contention rather than throughput, so there is no speed being traded away.
The number is a property of the machine, so it lives in `.env` as `JEST_WORKERS`, exactly like
`STRYKER_CONCURRENCY`. `npm run test:*` computes it from free memory
(`scripts/testing/machine-budget.ts`); a bare `npx jest` falls back to a fixed 2.

### The fix

`jest.config.mutation.js` swaps the transform to `@swc/jest` for the mutation run only. swc
translates and checks nothing, so it retains nothing between mutants. Types are still checked — once,
by `npm run ts-check` inside `npm run complete`, which is the right number of times: a mutant
changes an expression, not a signature, so re-checking per mutant cannot return a different answer.

It is also simply faster. The same 110 suites and 1527 tests:

| Transform                                         | Time       |
| ------------------------------------------------- | ---------- |
| ts-jest (`jest.config.js`, the normal run)        | ~21 s      |
| swc (`jest.config.mutation.js`, the mutation run) | **~9.7 s** |

**One compatibility note, and it is a real semantic difference rather than a quirk.** TypeScript
emits each `require` where its `import` stood; swc follows ESM and hoists imports to the top. A
`jest.mock` factory that reads a `const` declared between the two therefore works under ts-jest and
throws `Cannot access '<name>' before initialization` under swc. The fix is to reach the variable
from inside a function — a getter, or a wrapping arrow — so the read happens on access rather than
at factory time. `tests/unit/infrastructure/adapters/mailer-dispatch.test.ts` carries a worked
example in its comments.

**A second note, and this one is a property to preserve rather than a problem to fix.** swc
transpiles file-by-file with no cross-file knowledge — which is what makes it cheap, and is also its
one constraint: a type-only import must be written `import type`, or swc emits a real `require` for
a value that does not exist at runtime. The app is already written that way, enforced by
`verbatimModuleSyntax` in `tsconfig.json`, so nothing needs doing here beyond not turning that off.

**A third note: `jest.spyOn` on a namespace import.** `jest.spyOn(port, 'fn')` after
`import * as port` has to redefine an export. swc makes exports non-configurable getters, so under
this config it throws `TypeError: Cannot redefine property: fn`, while the normal run passes.
Replace the module with `jest.mock` instead, keeping the real function as the default
implementation — `tests/support/ports.ts` explains the pattern, and
`src/modules/invoicing/tests/unit/render.test.ts` shows it.

### Preventing it

- **Sweep before the run, not only after it.** A killed process cannot clean up after itself, so the
  next start has to.
- **Keep the data root out of the sandbox.** An absolute path passed in through the environment
  survives the copy; a `__dirname`-derived one does not.
- **Sweep dead siblings at `globalSetup`.** A directory named for a pid that no longer exists belongs
  to a dead instance and is safe to remove, which bounds accumulation _within_ a run rather than only
  between runs.
- **Cap the worker heap deliberately** instead of inheriting Node's default — which is a flat
  ceiling, not a function of the machine's RAM. See [the heap cap](#worker-heap-cap).

**A cap is containment, not a fix** — and for this leak it is weaker containment than it looks.
`--max-old-space-size` bounds V8's old space only; `ArrayBuffer` backing stores live outside it, so a
worker capped at 1400 MB was measured at 6.6 GB RSS. Against external memory the cap does not decide
how much a worker accumulates, only how early V8 panics about the part it can see.

### The heap cap — unset is not "as much as the machine has" {#worker-heap-cap}

V8's default old-space limit scales with system memory only up to a ceiling, and on 64-bit Node that
ceiling is around 4 GB. Measured here on Node v24.18.0, 30 GB of RAM:

```bash
node -e "console.log(require('v8').getHeapStatistics().heap_size_limit)"
# → 4496293888   (≈ 4.2 GB)
```

Past roughly 16 GB of RAM, a bigger machine therefore buys a Stryker worker nothing: every one of
them gets the same ~4.2 GB. Measured 2026-09-20, a full run hit that ceiling directly —
`FATAL ERROR: Ineffective mark-compacts near heap limit`, inside the first minute, identically at
concurrency 6, 4, 2 and 1, with 10+ GB of the machine free throughout. `STRYKER_WORKER_HEAP_MB=8192`
survived where unset did not.

Two failure modes wear the same "ran out of memory" label:

| Symptom                                                   | Cause                                                                    | The lever                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Crash in the first minute, identical at every concurrency | a worker wants more than V8's ~4.2 GB default                            | `STRYKER_WORKER_HEAP_MB`                                                                    |
| Climb per test file or per mutant, RSS far above any cap  | old test files kept alive, each holding `bson`'s 17 MiB outside the heap | [the test environment](./mutation-testing-memory.md#one-process-per-dry-run) — a cap cannot |

Budget `STRYKER_WORKER_HEAP_MB × STRYKER_CONCURRENCY` against free RAM, and re-measure the default
on your own Node version rather than trusting the number above: it reads like a V8 default, not a
documented constant.

## Read next

- [Mutation testing: when a run never finishes](./mutation-testing-oom.md)
