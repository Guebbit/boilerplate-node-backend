---
type: concept
audience: [developer]
---

# Testing: gate or hunter, and what is deliberately not done

Part of [Testing & Docs](./testing-and-docs.md): which checks gate a change, which only hunt, and what was considered and left out.

## Gate or hunter

Worth naming explicitly, because it decides where a suite runs and how a failure is read.

A **gate** answers a yes/no question fast enough to block a merge. Unit, integration, concurrency and contract are gates: they run on every push, and a failure means "do not merge this".

A **hunter** goes looking for problems nobody has asked about. Mutation and the deep fuzz pass are hunters: they are slow, they run on a schedule or per diff, and a failure is usually a **finding to read** rather than a merge to stop. A hunter wired as a gate gets switched off the first week it is inconvenient — which is why both live in their own workflow files where they cannot become PR gates by accident.

The corollary is that a green pull request is not a claim the hunters agree. That is what the nightlies are for.

## Deliberately not done

Four layers were considered for this repository and left out. They are recorded here rather than
dropped silently, because "absent" and "rejected for a reason" look identical in a codebase, and the
next person to notice the gap deserves the argument rather than a rediscovery.

Each entry says what the thing **is**, why it is not here, and what would change that answer.

### Performance budgets, soak runs and query-shape tests

**What exists.** Load can be applied by hand: `npm run bench` (one URL) and
`npm run bench:k6` (the `browse` and `checkout` scripts in `tests/load/`). None of it runs in CI or
asserts a budget; that is what the rest of this entry is about.

**What it is.** Everything above asks "is the answer correct?". This family asks "is the answer
_fast enough_, and does it stay correct under volume?" — behaviour as a function of load and time
rather than of input. It is usually three distinct activities that get lumped under one name:

| Kind                 | Question                                                                                | Typical tool            |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| **Load**             | With N concurrent users, do latency and error rates stay inside budget?                 | k6, artillery           |
| **Soak / endurance** | Under sustained traffic for hours, does memory or a connection pool grow without bound? | the same, run long      |
| **Micro-benchmark**  | Is this function still O(n log n) rather than O(n²) after the refactor?                 | tinybench, benchmark.js |

A related, cheaper cousin is **query-shape assertion**: not "how fast is this", but "does this
endpoint still use an index, and does it still issue one query rather than N+1?".

**Why it is not here.** A budget is only meaningful against a workload, and this repository's
workload is a demo shop with a few dozen seeded rows. A p95 measured against that says nothing about
a fork's catalogue of two hundred thousand products, so any number committed here would be inherited
as authoritative while being meaningless — worse than no number.

The environment is the second problem. Load results are a property of the machine, the database
sizing and the network as much as of the code. Run on a shared CI runner, a load test largely
measures the runner, and the resulting flakiness is the kind that gets a job disabled.

**What would change it.** In a fork, once real traffic shapes exist: load tests against a
production-like environment, on a schedule, with budgets derived from that project's own SLOs — not
from this one's.

The part that WOULD transfer even here is the cheap structural subset, because it is deterministic
and needs no load rig: assert that a query plan shows an index scan rather than a collection scan
(`explain()` → `IXSCAN`, not `COLLSCAN`), and assert the number of queries an endpoint issues, which
is how an N+1 is caught while it is one line old. That is a genuine gap and a reasonable next
addition; it is simply not "performance testing" in the sense above.

### Diff coverage as a separate gate

**What it is.** A CI gate that ignores the repository's overall coverage and asks only about the
lines this pull request touched — typically "changed lines must be ≥90% covered". It is the standard
answer to a codebase whose global number is too low to raise, since it stops the bleeding without
requiring history to be fixed.

**Why it is not here.** Coverage is not measured at all, and the changed files already carry a
better gate: `npm run mutation` runs Stryker over the files a branch touched, where an unrun line is
a `NoCoverage` mutant and the **per-file mutation ratchet** answers "did the tests get weaker".

**What would change it.** A large legacy area scoring far below the ratchet, where fixing history
is not realistic. Diff coverage is the right tool for that situation — this repository is simply
not in it.

### Type-level tests

**What it is.** Assertions about _types_ rather than about runtime values — that a signature has not
silently widened to `any`, that a generic infers what it should, that an invalid call is rejected by
the compiler. Written with `expectTypeOf` (Vitest) or `tsd`, and checked by running the type checker
rather than a test runner.

**Why it is not here.** They earn their place when the types **are** the product, as in a published
library whose consumers see nothing else. This repository's public surface is `openapi.yaml`, and it
is already defended from three sides: the contract suite exercises it over real HTTP, the generated
zod schemas are derived from it rather than hand-written, and the spec-identity check proves the
frontend holds the same file byte for byte. A type-level test would be a fourth check on the
best-guarded thing here.

**What would change it.** Extracting anything from this repository into a standalone package. At
that point the exported types become the contract and this is the layer that guards them.

### Incremental mutation mode

**What it is.** Stryker can cache per-mutant results (`incremental: true`) and, on the next run,
re-test only the mutants a diff could plausibly have affected — turning a full run into a short one.

**Why it is not here.** The pull-request run is already scoped to the changed files, and the whole-repo run is sharded and monthly (`mutation:full`), so no run needs the cache to fit its window. Against that, the cache invalidates far more broadly than intuition suggests — a
change to a widely-imported module re-tests most of its dependents — so the saving is unpredictable
rather than proportional to the diff. And a stale-but-trusted cache is a quiet failure: it reports
green for mutants nobody re-ran.

**What would change it.** The run outgrowing its window, or a decision to run the whole-repo mutation more often than monthly. Both make the trade worth re-examining; neither is true today.

## Read next

- [Testing & Docs](./testing-and-docs.md)
