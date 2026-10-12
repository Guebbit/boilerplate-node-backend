# Coverage & Confidence

**Which number tells you the test suite is good, and why line coverage is not one of them.**

Coverage is **not measured anywhere** in this repository: no threshold, no floor, no report, no CI
job. Two numbers judge the tests, and this page is the map of why.

::: tip The one-line version
**Mutation score is the one test-quality number. Pass rate is not negotiable.**
:::

---

## 1. The two numbers

| Number             | The question                                 | If it is low                                  |
| ------------------ | -------------------------------------------- | --------------------------------------------- |
| **Pass rate**      | did every assertion hold                     | something is **broken**. Fix it now.          |
| **Mutation score** | would a test **notice** if this code changed | the suite is **weak here**. The real verdict. |

Pass rate is absolute and has no threshold. One failing test is a red build. Nothing below softens
that, and no percentage anywhere in this repo applies to it.

### Why mutation testing replaces coverage

Coverage asks whether a line ran. That is a low bar, and it is trivially gamed without meaning to:

```ts
// 100% coverage. Zero assertions about the result.
it('does not explode', () => {
    expect(() => calculateTotal(order)).not.toThrow();
});
```

Every line of `calculateTotal` executes. Coverage says 100%. Change `+` to `-` inside it and this
test still passes — so the test was never testing the arithmetic.

Mutation testing asks the question that matters. Stryker rewrites the code — flips a comparison,
drops a call, changes a boundary, returns an empty array — reruns the tests, and checks that
**something goes red**. A mutant that survives is a change nobody would have caught.

The relationship is one-directional, and that is what makes coverage redundant:

> **An uncovered line cannot kill a mutant.** So every coverage gap already appears as surviving
> mutants — while a covered line with no real assertion appears only in the mutation score.

**Mutation score subsumes coverage.** Stryker marks every line no test ran as a `NoCoverage`
mutant, per line: that list is the "which code did nothing run" view, and it needs no second tool.

---

## 2. Why the coverage floors were deleted

Per-file coverage thresholds used to run on the unit and cross-cutting suites. They went, on both
repositories, for three reasons:

- **They told nothing mutation testing does not.** The one argument for them was speed. It stopped
  being true: the run took about 12 minutes locally and 18 on CI, and the job was report-only and
  had been red since it was created.
- **They misled.** They measured only the unit and cross-cutting run, so a repository or service
  that the integration suites test well still read as low.
- **Under v8 they even fall when a test is added.** v8 counts a branch only inside a function that
  ran, so a file whose functions all go uncalled reads 0/0 = 100%. Once a test calls one of them,
  the paths that test skips appear as misses: `payments/services/settlement.ts` went from 100% to
  28.6% when one of its 16 functions got called.

What to do instead of reading a coverage number:

| You want to know                     | Read                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| Is this change tested well           | `npm run mutation` — the files the branch changed                  |
| Which code did no test run           | the `NoCoverage` mutants in the Stryker report, per line           |
| Is the suite getting worse over time | `mutation-baseline.json`, compared per file by `check-baseline.ts` |

---

## 3. Redundancy, and things that only look like it

The interesting cases are the ones people delete by mistake.

### Genuinely redundant

- **A test asserting a line runs**, where another test asserts what it produces.

### Looks redundant, is not

- **Integration tests vs unit tests over the same service.** They fail differently. A unit test
  says the calculation is wrong; an integration test says the calculation is right and the router
  never calls it. Deleting either loses a distinct failure.
- **`tests/contract/` vs `tests/integration/`.** Both drive real HTTP. Contract checks the response
  against `openapi.yaml` — a shape the app can get wrong while behaving correctly, and which a
  second repository consumes.
- **`tests/fuzz/` vs everything.** Generated hostile input against the spec. It asks what happens
  on inputs nobody thought to write down, which is by definition not covered by the tests someone
  wrote.
- **ESLint vs dependency-cruiser.** ESLint sees one file's imports; dependency-cruiser sees the
  graph. "May not import" and "may not REACH, through any number of hops" are different rules, and
  the second is the one that catches a domain file reaching storage through a helper.

### The rule

> Two checks are redundant when one **subsumes** the other — when passing the stronger one makes
> failing the weaker one impossible. If they can disagree, they are measuring different things and
> both earn their place.

Mutation score subsumes coverage, which is why coverage is not measured. Integration does not
subsume unit; contract does not subsume integration.

---

## 4. Mutation testing is the instrument here

This is a decision, recorded so it is not re-litigated by accident.

`npm run mutation` / `npm run mutation:full` and their per-file scores in `mutation-baseline.json`
are **the** judgement of whether this suite is any good. Everything else asks a different question
entirely (contract, fuzz, cluster).

Consequences worth stating:

- **Do not chase an execution number.** Writing tests that execute code without asserting anything
  about it is worse than nothing — it buys a green number and hides the gap.
- **A surviving mutant is a real finding**, even where every line ran. It is usually a missing
  assertion, occasionally a mutant that cannot be killed because the code has no observable effect —
  in which case the code, not the test, is the thing to look at.
- **The baseline is a ratchet**: `check-baseline.ts` compares
  each file against its recorded score with a 1-point tolerance, so the gate is "do not get worse"
  rather than an absolute grade.

### The `high` / `low` / `break` thresholds

`stryker.json` carries `high: 80`, `low: 60`, `break: null`. `high`/`low` only colour the report —
`break` is deliberately unset, because a single global percentage over the whole scope hides exactly
the file that matters (see [The per-file ratchet](./mutation-testing.md#the-per-file-ratchet)). The
ratchet in `mutation-baseline.json` is the real gate. Either way, killing 80% of
mutants is a far stronger statement than executing 80% of lines would be.

---

## 5. ⚠️ The blind spot that used to exist, and why closing it took a memory fix first

::: warning Historical: mutation testing used to exclude the service layer entirely
Until 2026-09-20 `stryker.config.json` mutated `src/modules/*/**/*.ts` — controllers, services, <!-- doc-paths:ignore -->
repositories, models — while excluding `tests/integration/`, `tests/contract/` and their co-located
equivalents from the tests it ran. **It mutated code whose killing tests it never executed.** Those
mutants were reported `NoCoverage`, which scores as 0%, and 153 of 254 files in that ruler's
baseline sat at 0% for that reason rather than because the tests were weak.

**One ruler now.** `stryker.json` is the only config, and it always loads `tests/integration/` — see
[one ruler](./mutation-testing.md#one-ruler). More tests running can only kill more mutants, never
fewer, so this closes the blind spot rather than trading it for a different one. The price is
real: every mutation run now starts a real Mongo, so the per-mutant cost is higher — which is why
the full sweep is sharded and monthly rather than an unsharded nightly (below, and
[The three commands](./mutation-testing.md#the-three-commands)).

**The exclusion was a memory-leak workaround, not an oversight**, and understanding why it existed
still matters — the leak it worked around had to be fixed BEFORE the ruler could be merged. Loading
the integration suites into a mutation run used to trigger an unbounded memory leak. Measured on
the delivery module's one service file at the time (54 mutants), 2026-08-29:

| Configuration                            | Score     | Time | OOM restarts |
| ---------------------------------------- | --------- | ---- | ------------ |
| unit suites only (the old default)       | 0.0%      | 5s   | 0            |
| + integration & contract                 | **64.8%** | 812s | **23**       |
| + integration & contract, `ignoreStatic` | 62.0%     | 582s | **46**       |

The middle row is the prize: 50 of those 54 mutants go from `NoCoverage` to tested, and 35 die. The
third row is the diagnosis — ignoring static mutants made the run _faster_ and the OOMs _twice as
frequent_, because static mutants were forcing the process restarts that had been incidentally
flushing the leak. It is why `ignoreStatic` stays off permanently — see
[the measured ratio](./mutation-testing.md#static-mutants-open-question).

**The leak is `bson`, not the database and not the machine.** `node_modules/bson/lib/bson.cjs`
allocates a 17 MiB scratch buffer at module scope, on every evaluation. Jest gives each test FILE a
fresh module registry, so every file reaching mongoose pays 17 MiB again — roughly ten copies per
mutant, accumulating in a worker Stryker never exits. A normal `npm test` never notices, because its
workers exit and return the memory.

**Why a bigger machine does not help.** `--max-old-space-size` bounds V8's old space, and
`ArrayBuffer` backing stores live outside it: V8 sees a comfortable heap, feels no pressure to
collect, and RSS grows regardless — a worker capped at 1400 MB was measured at 6.6 GB. More RAM buys
more mutants before the crash, never a finished run. A cap is the wrong lever against _this_ leak —
it is the right one against V8's flat ~4.2 GB default ceiling, a different failure with the same
label ([the heap cap](./mutation-testing.md#worker-heap-cap)). `scripts/mutation/stryker-run.ts`
aborts a run that OOMs more than six times in ten minutes as one that will not converge.

**This is now fixed, and the fix was one setting.** `stryker.json` sets `maxTestRunnerReuse: 1`,
restarting the test runner after every mutant so the copies cannot accumulate. Measured on the same
file: **0 OOM restarts, 406s instead of 812s, identical 64.81% score.** The restart costs less than
the crash-and-retry it replaces. That fix is what made merging the two rulers into one viable at
all — [one ruler](./mutation-testing.md#one-ruler) is how it is scheduled now.

The full investigation, including the three measurements that disproved the database hypothesis, is
in [Mutation Testing → the OOM strand loop](./mutation-testing.md).
:::

::: warning Which number to read
There is one baseline now, `mutation-baseline.json`, and every score in it comes from the ruler that
runs `tests/integration/` too — so a 0% on a controller, service or repository is a real finding,
not an artefact of the ruler that used to skip those suites. The pending reseed
([one ruler](./mutation-testing.md#one-ruler)) is what makes the numbers currently on disk
comparable to that statement — until it runs, treat the committed file as stale.
:::

## 6. Where the number is currently trustworthy

Honesty about instruments in use matters more than the instruments.

**Mutation.** `stryker.json` mutates `src/modules/*/**/*.ts` and runs the integration suites that
reach the service and repository layers, so a repository or service tested only through HTTP is
judged on that testing. A file can still run every line and score low, which is the finding the
number exists to produce: the lines run, nothing asserts on what they did. See
[Mutation Testing](./mutation-testing.md) for the current shape.

**A single combined coverage run was tried and abandoned.** Every suite under one instrumented
process dies on a V8 fatal assertion with the fuzz suite, and on
`FATAL ERROR: JavaScript heap out of memory` (~4 GB, ~8 minutes) without it. Recorded so nobody
spends the afternoon again: the question it answered, mutation testing answers better.

---

## Related pages

- [Mutation Testing](./mutation-testing.md) — the run, the baseline ratchet, the OOM history
- [Unit Testing](./unit-testing.md) · [Integration Testing](./integration-testing.md) ·
  [Contract Testing](./contract-testing.md) · [Fuzz Testing](./fuzz-testing.md)
- [Tests](../reference/tests.md) — every suite, file by file
