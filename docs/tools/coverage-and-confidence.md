# Coverage & Confidence

**Which number tells you the test suite is good, and which numbers only look like they do.**

Four things in this repository measure the tests rather than the code. They overlap, they disagree,
and the overlaps are not all redundancy — some of them are the point. This page is the map.

::: tip The one-line version
**Mutation testing is the instrument. Coverage is the smoke alarm. Pass rate is not negotiable.**
:::

---

## 1. The three numbers, ranked

| Number             | The question                                 | If it is low                                  |
| ------------------ | -------------------------------------------- | --------------------------------------------- |
| **Pass rate**      | did every assertion hold                     | something is **broken**. Fix it now.          |
| **Mutation score** | would a test **notice** if this code changed | the suite is **weak here**. The real verdict. |
| **Coverage**       | did this line **execute** during that run    | that run did not **reach** this code.         |

Pass rate is absolute and has no threshold. One failing test is a red build. Nothing below softens
that, and no percentage anywhere in this repo applies to it.

The other two rank, and the ranking is not a matter of taste.

### Why mutation testing outranks coverage

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

The relationship is one-directional, and that is what makes the ranking real:

> **An uncovered line cannot kill a mutant.** So every coverage gap already appears as surviving
> mutants — while a covered line with no real assertion appears only in the mutation score.

**Mutation score subsumes coverage.** Where the two disagree, the mutation score is right.

---

## 2. So why keep coverage at all?

Because of latency, not information.

|                              | Runtime                                          | Runs on    |
| ---------------------------- | ------------------------------------------------ | ---------- |
| `npm run test:unit:coverage` | seconds                                          | every push |
| `npm run test:mutation`      | far longer — it reruns the suite once per mutant | nightly    |

Coverage is the **smoke alarm**: cheap, fast, and it tells you something changed shape. Mutation
testing is the **inspection**: slow, thorough, authoritative.

That is not redundancy. Two instruments answering one question at different costs is a normal and
correct arrangement — the mistake would be reading the fast one as the verdict.

**What this means in practice:** the coverage floors in `jest.config.js` are a **ratchet**
("do not get worse"), never a target, and never evidence that code is well tested. Read them as
nothing more than a tripwire between nightly mutation runs.

---

## 3. Redundancy, and things that only look like it

The interesting cases are the ones people delete by mistake.

### Genuinely redundant

- **A coverage floor on a file whose mutation score is enforced.** Same question, weaker
  instrument. The floor adds nothing the mutation score does not already say.
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
  graph. "May not import" and "may not REACH, through any number of hops" are different rules —
  see `REINVENTING_THE_WHEEL.md`.

### The rule

> Two checks are redundant when one **subsumes** the other — when passing the stronger one makes
> failing the weaker one impossible. If they can disagree, they are measuring different things and
> both earn their place.

Mutation score subsumes coverage. Integration does not subsume unit; contract does not subsume
integration.

---

## 4. Mutation testing is the primary instrument here

This is a decision, recorded so it is not re-litigated by accident.

`npm run test:mutation` and its per-file scores in `mutation-baseline.json` are **the** judgement of
whether this suite is any good. Everything else is either a faster proxy for it (coverage) or a
different question entirely (contract, fuzz, cluster).

Consequences worth stating:

- **Do not chase a coverage number.** Raising coverage without raising the mutation score means
  writing tests that execute code without asserting anything about it, which is worse than nothing —
  it buys a green number and hides the gap.
- **A surviving mutant is a real finding**, even at 100% coverage. It is usually a missing
  assertion, occasionally a mutant that cannot be killed because the code has no observable effect —
  in which case the code, not the test, is the thing to look at.
- **The baseline is a ratchet**, like the coverage floors: `check-mutation-baseline.ts` compares
  each file against its recorded score with a 1-point tolerance, so the gate is "do not get worse"
  rather than an absolute grade.

### The `high` / `low` / `break` thresholds

`stryker.config.json` carries `high: 80`, `low: 60`, `break: 60`. These colour the report and fail
the run below `break`. They are **not comparable to a coverage percentage** — killing 80% of mutants
is a far stronger statement than executing 80% of lines.

---

## 5. ⚠️ The blind spot, and why it is not a configuration mistake

::: danger Mutation testing cannot currently reach the service layer, and raising the memory limit will not change that
`stryker.config.json` mutates `src/modules/*/**/*.ts` — controllers, services, repositories, models
— while excluding `tests/integration/`, `tests/contract/` and their co-located equivalents from the
tests it runs. **It therefore mutates code whose killing tests it never executes.** Those mutants
are reported `NoCoverage`, which scores as 0%, and **153 of 254 files in `mutation-baseline.json`
sit at 0% for this reason** rather than because the tests are weak.

**The exclusion is a fix, not an oversight.** Loading the integration suites into a mutation run
triggers an unbounded memory leak. Measured on `delivery/service.ts` (54 mutants), 2026-08-29:

| Configuration                            | Score     | Time | OOM restarts |
| ---------------------------------------- | --------- | ---- | ------------ |
| unit suites only (current)               | 0.0%      | 5s   | 0            |
| + integration & contract                 | **64.8%** | 812s | **23**       |
| + integration & contract, `ignoreStatic` | 62.0%     | 582s | **46**       |

The middle row is the prize: 50 of those 54 mutants go from `NoCoverage` to tested, 35 die, and the
file clears the `break: 60` threshold on its own. The third row is the diagnosis — ignoring static
mutants made the run _faster_ and the OOMs _twice as frequent_, because static mutants were forcing
the process restarts that had been incidentally flushing the leak.

**The leak is `bson`, not the database and not the machine.** `node_modules/bson/lib/bson.cjs`
allocates a 17 MiB scratch buffer at module scope, on every evaluation. Jest gives each test FILE a
fresh module registry, so every file reaching mongoose pays 17 MiB again — roughly ten copies per
mutant, accumulating in a worker Stryker never exits. A normal `npm test` never notices, because its
workers exit and return the memory.

**Why a bigger machine does not help.** `--max-old-space-size` bounds V8's old space, and
`ArrayBuffer` backing stores live outside it: V8 sees a comfortable heap, feels no pressure to
collect, and RSS grows regardless — a worker capped at 1400 MB was measured at 6.6 GB. More RAM buys
more mutants before the crash, never a finished run. `.env` leaves `STRYKER_WORKER_HEAP_MB` unset
deliberately for exactly this reason, and `scripts/run-mutation-tests.ts` aborts a run that OOMs
more than six times in ten minutes as one that will not converge.

**This is now fixed, and the fix was one setting.** `stryker.deep.json` sets
`maxTestRunnerReuse: 1`, restarting the test runner after every mutant so the copies cannot
accumulate. Measured on the same file: **0 OOM restarts, 406s instead of 812s, identical 64.81%
score.** The restart costs less than the crash-and-retry it replaces. The deep run is therefore
viable, and [The three runs](./mutation-testing.md#the-three-runs) is how it is scheduled.

The full investigation, including the three measurements that disproved the database hypothesis, is
in [Mutation Testing → the OOM strand loop](./mutation-testing.md).
:::

::: warning Which number to read
`mutation-baseline.json` is the UNIT scope, and a 0% in it on a controller, service or repository
means "unmeasured", never "untested" — that ruler does not run the suites covering those files.
`mutation-baseline-deep.json` is the scope that does; read that one for those files, and treat a 0%
in it as a real finding. A 0% in the unit baseline on a file the unit suite DOES reach is also
real.
:::

## 6. Where each number is currently trustworthy

Honesty about instruments in use matters more than the instruments.

**Coverage.** `test:unit:coverage` runs `tests/unit`, `tests/cross-cutting` and each module's own
`tests/unit` — not the integration or contract suites. So a service covered entirely by integration
specs reads near zero, and that is a fact about the RUN, not about the code. The floors were
re-fitted to what that run actually measures on 2026-08-29; `jest.config.js` explains what they do
and do not buy.

**Mutation.** `stryker.config.json` mutates `src/modules/*/**/*.ts` while excluding those same
suites from the tests it runs, so it currently shares the blind spot — it mutates code whose killing
tests it never executes. That is why files can read 100% coverage and 0% mutation score at once.
See [Mutation Testing](./mutation-testing.md) for the current state of that suite selection.

**A single combined coverage run was tried and abandoned.** Every suite under one instrumented
process dies on a V8 fatal assertion with the fuzz suite, and on
`FATAL ERROR: JavaScript heap out of memory` (~4 GB, ~8 minutes) without it. It would need an
enlarged heap or per-suite runs with merged reports: real machinery, for the weaker instrument,
answering a question mutation testing answers better. Recorded so nobody spends the afternoon again.

---

## Related pages

- [Mutation Testing](./mutation-testing.md) — the run, the baseline ratchet, the OOM history
- [Unit Testing](./unit-testing.md) · [Integration Testing](./integration-testing.md) ·
  [Contract Testing](./contract-testing.md) · [Fuzz Testing](./fuzz-testing.md)
- [Tests](../reference/tests.md) — every suite, file by file
