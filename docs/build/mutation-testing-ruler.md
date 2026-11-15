---
type: concept
audience: [developer]
---

# Mutation testing: the ruler and the scope

Part of [Mutation Testing](./mutation-testing.md): which suites count, what is excluded, and which files are mutated.

## One ruler — why every run now includes `tests/integration/` {#one-ruler}

Decided 2026-09-20. There used to be two Stryker configs: `stryker.config.json` excluded <!-- doc-paths:ignore -->
`tests/integration/` and `tests/contract/` for speed, `stryker.deep.json` included the former. <!-- doc-paths:ignore --> **The
unit-only config is gone.** `stryker.json` is the only config, and it always runs the integration
suites — because more tests running can only kill more mutants, never fewer, so the wider ruler is
strictly more informative about the same code, and its only real cost is speed.

That cost was the entire reason the split existed, and it was worse than "slower": the unit-only
ruler read **126 of its 214 files at 0%** — no unit test touches a service or repository at all, so
every mutant in them scored `NoCoverage` by construction. Measured on the delivery module's one service file at the time: **0%**
under the unit ruler, **64.8%** under the one that also runs `tests/integration/`. Same tests, same
code, only the ruler changed.

**The price, stated plainly.** Every mutation run now starts a real Mongo and runs integration
tests, so the per-mutant cost goes up. That is why the full scope is always sharded and runs monthly
rather than as an unsharded nightly — see [The three commands](./mutation-testing-running.md#the-three-commands).

**What the merge depends on: a test file must free its memory when it ends.** A mutation run loads
far more files per process than `npm test` does, so anything a file leaves reachable accumulates —
and `bson`'s 17 MiB buffer makes each leftover file expensive. The cause and the fix are in
[One process per dry run](./mutation-testing-memory.md#one-process-per-dry-run); how `bson` shows up is under
[the `bson` warning sign](./mutation-testing-memory.md#the-bson-warning-sign).

### What is still excluded, and why

`stryker.json` restricts the Jest config Stryker drives to exclude `tests/contract/`, `tests/fuzz/`, both of those trees' per-module homes, and `tests/integration/journeys/`:

```json
"jest": {
    "config": {
        "testPathIgnorePatterns": [
            "/node_modules/",
            "<rootDir>/tests/contract/",
            "<rootDir>/tests/fuzz/",
            "<rootDir>/src/modules/[^/]+/tests/contract/",
            "<rootDir>/tests/integration/journeys/",
            "<rootDir>/tests/cross-cutting/contract-bundles.test.ts",
            "<rootDir>/tests/cluster/",
            "<rootDir>/tests/broker/",
            "<rootDir>/tmp/",
            "<rootDir>/.claude/worktrees/"
        ]
    }
}
```

**Contract and fuzz stay excluded.** A contract test boots the entire app through supertest, so
`enableFindRelatedTests` relates it to nearly every file — every mutant would pay an application
boot, and a one-line change in one module would drag in the whole contract suite. Fuzz suites are
non-deterministic by construction: a mutant killed by a random input on one run and not the next
produces a score that moves on its own, which is the one thing a ratchet cannot tolerate.

**Journeys stay excluded** for the contract suite's reason: each one boots the whole app, so
`enableFindRelatedTests` relates it to nearly every file, and a one-line change would drag the
lot in. See [Journeys](../reference/tests.md#tests-integration-journeys-—-one-user-across-modules).

`tests/cluster/` forks real workers against a Redis and is not part of `npm test` either; neither is
`tests/broker/`, which needs a real RabbitMQ. `tmp/` and
`.claude/worktrees/` are not suites at all: they hold Stryker's own sandboxes and other checkouts'
copies of the tests, which jest would otherwise discover and run as if they were this tree's.

The `contract-bundles.test.ts` entry is excluded because it asserts the contract generators: each case builds a
contract document in memory from its sources and checks the result. It exercises `scripts/` and the contract
sources.

**The unit layer's cost depends on a naming rule, and that is the fragile part.** A file under
`src/modules/*/tests/unit/` that calls `setupTestDb()` starts a real `mongod` and connects mongoose
to it, while nothing about its name warns that it does. So a database-touching spec lives in its
module's `tests/integration/`, and `unit-layer-stays-database-free` in
`.dependency-cruiser.cjs` is what keeps a new one from drifting back in — it asks whether a spec can
REACH a database, so a helper that pulls one in is caught too. Confirm the unit layer is clean with:

```bash
npm run check
```

That grep, and the incident it used to report, is the load-bearing fact behind the failure mode
below — kept as a worked example because the mechanism it describes (a `beforeAll` cost paid once
per mutant) is general, not specific to this one fixed case.

Measured on `src/modules/products/repository.ts` — 196 mutants, a file with no unit tests at all
and a thorough integration suite — on 2026-08-27, back when the two rulers still existed separately:

| scope                               | score      | NoCoverage | wall clock |
| ----------------------------------- | ---------- | ---------- | ---------- |
| unit only (the old default)         | **0.00%**  | 161 of 196 | —          |
| \+ integration (now the only ruler) | **82.14%** | 3 of 196   | 22m 13s    |

That is the same file, the same tests, and the same day. The 0% was never a statement about the
repository's tests; it was a statement about the ruler. Read it beside
[Reading a 0%](#reading-a-0-—-and-the-one-case-where-it-was-excluded-instead), which makes the same
point from the other direction.

**This is also why the controllers are not mutated.** They have no unit tests; they are covered by the contract suite, which Stryker still doesn't run. Put them in `mutate` and all 60 files report ~0% — and that number would not mean "the controllers are untested", it would mean "they were measured with a ruler configured not to touch them". Worse, the ratchet would then record those zeros and defend them forever. Measuring controllers honestly requires running contract under Stryker too, which is a much larger cost decision than this one.

## Scope — what is mutated

```json
"mutate": [
    "src/infrastructure/**/*.ts",
    "src/kernel/**/*.ts",
    "src/domain-primitives/**/*.ts",
    "src/modules/*/**/*.ts",
    "!src/modules/*/index.ts",
    "!src/modules/*/tests/**"
]
```

A counterintuitive but important consequence of the table above: **untested files are free to include.** A mutant with no covering test is reported `NoCoverage` without running anything, so a file at 0% costs nothing and honestly records the gap. The cost lives entirely in _well-covered_ code — especially static-and-covered code.

That is why the list above is so short. The bar for excluding something is **"a mutant here could not mean anything to anyone"**, not "our tests would not kill it" — an unkilled mutant is a finding, while a file missing from the report is a blind spot, since an absent file reads exactly like a file with no survivors. Only two things clear that bar: a module's `index.ts`, a barrel whose mutants ask whether a re-export changed; and `tests/**`, which is not the code under test.

### Suppressing logger calls, line by line {#suppressing-logger-calls}

A file staying in `mutate` does not mean every line in it does. From a completed 181-mutant report,
**29 of 35 survivors were `logger.*` calls** — a mutated log message, level, or metadata field that
no test asserts on and none should: nothing here is behaviour, and asserting on log output couples
tests to wording nobody reads programmatically. Every `logger.info/warn/error/debug/trace/fatal(...)`
call site in `src/**` carries `// Stryker disable next-line all` (or the `disable all` /
`restore all` pair, for a call that spans more than one line) — see
[Ignore mutations](https://stryker-mutator.io/docs/stryker-js/ignore-mutations/) for the comment
syntax. This is a suppression at the call site, not an exclusion of the file: everything else in
that file is still measured normally.

### Reading a 0% — and the one case where it was excluded instead

Everything else stays in scope, including code this runner cannot reach, because a 0% is usually a
true statement worth keeping in front of people.

`src/app/**` is the exception, and it is worth understanding why it is not a precedent. The Express
wiring measured **0.00% across all eight files: 126 mutants, every one `NoCoverage`, not a single
survivor** — because it is exercised by `tests/contract`, which this _runner_ excludes by
`testPathIgnorePatterns` (see [What is still excluded](#what-is-still-excluded-and-why)), and by no
unit test at all. The measurement predates [one ruler](#one-ruler); `tests/integration` runs under
Stryker now, and the tier stays out of `mutate` until someone re-measures it with that ruler.

That made it a different animal from an honest zero. An honest zero is code a suite _could_ reach
and none does — a finding, and actionable. These 126 mutants had **no test that could ever kill
them**, so they dragged the global number down permanently while telling nobody anything, and they
put a global `break` of 70 out of reach by construction rather than by neglect.

So the tier was excluded, taking the global score from ~65.7% to ~68.3%. What is lost is a standing
reminder, and it is recorded here instead (`stryker.json`'s `mutate` simply does not list `src/app`): **the Express wiring has no
unit tests.** If that changes, put it back in scope — then its number would mean something.

The bar this cleared, and that a future exclusion has to clear too: _no configured suite can reach
this code at all._ "Our tests would not kill it" is not that bar. The paired frontend answers the
same question the same way for `.vue` files, on mirror-image reasoning — Stryker cannot mutate
template expressions, so a score there would imply coverage nobody has.

The three outcomes are different findings, and the columns keep them apart:

| Outcome         | What happened                                 | What to do                                 |
| --------------- | --------------------------------------------- | ------------------------------------------ |
| **Killed**      | a test ran it and an assertion depended on it | nothing                                    |
| **Survived**    | a test ran it and nothing noticed             | sharpen the assertion                      |
| **No coverage** | nothing ran it                                | write a test, or accept the runner's reach |

Two shapes of unreached code show up differently, and it is worth knowing which you are looking at. Code that runs at **import time** — a route table literal, a schema built at module scope — executes as soon as any test imports the module, so its mutants are _covered_ and come back as **survivors**: `users/routes.ts` reports 36 of them. A **function body** only executes when called, so an uncalled one comes back as **no coverage**. Zero survivors alongside a high no-coverage count is the signature of a file nothing invokes.

Controllers illustrate why a blanket exclusion is the wrong instrument. They were once excluded wholesale on the assumption that only contract and integration tests reach them — but several are unit-tested directly as plain functions with fake `req`/`res` objects (`post-login`, `get-refresh-token`, `delete-account`, `post-account-restore`, `get-observability-metrics-overview`). The exclusion was therefore hiding real, working coverage as well as honest gaps.

## Read next

- [Mutation Testing](./mutation-testing.md)
