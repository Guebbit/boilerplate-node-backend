# Deterministic tools — what this repo has, what it is missing

Parked here on purpose: the active discussion is about **AI-powered auditing**, and these are the
non-AI instruments that either already cover part of that ground or would shrink the surface the
expensive fuzzy tools have to search.

Nothing here uses a model. Everything here is reproducible, gates CI safely, and never returns a
different answer on Tuesday.

---

## Already installed — no action

| Tool                                                         | Where                                                                                                                                                                                                                                                                                                                 | Covers                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Stryker**                                                  | `npm run test:mutation`, `mutation-baseline.json`, `.github/workflows/mutation.yml`                                                                                                                                                                                                                                   | Tests that assert nothing. The single best non-AI detector of correlated blind spots.                |
| **fast-check**                                               | 8 files — `orders/tests/unit/totals.property.test.ts`, `money.property.test.ts`, `inventory/tests/integration/ledger.property.test.ts`, `tests/cross-cutting/search.property.test.ts`, `serialize.property.test.ts`, `tests/contract/request-contract.test.ts`, `tests/fuzz/endpoints.fuzz.test.ts`, `logger.test.ts` | Domain invariants over generated input. Already the right answer to a chunk of "missing edge cases". |
| **Prism**                                                    | `npm run test:prism`                                                                                                                                                                                                                                                                                                  | Implementation vs. contract, single request.                                                         |
| **jest-openapi**                                             | contract suites                                                                                                                                                                                                                                                                                                       | Response bodies match the OpenAPI schema.                                                            |
| **CodeQL**                                                   | `.github/workflows/codeql.yml`                                                                                                                                                                                                                                                                                        | Taint-style security findings.                                                                       |
| **Spectral / AsyncAPI validate / depcruise / spec-identity** | `npm run complete`                                                                                                                                                                                                                                                                                                    | Contract and dependency-graph drift.                                                                 |

The property-testing layer is further along than most repos ever get. Treat "add property tests" as
already done, not as a gap.

---

## The real gap — stateful contract fuzzing

`tests/fuzz/endpoints.fuzz.test.ts` and `test:prism` both drive **one request at a time**. Nothing
in the suite drives a _sequence_, so the whole class of state-dependent failures is untested:

```
create order → pay → cancel → pay again
reserve stock → order expires → reserve again
add to cart → product deleted → checkout
```

These are where a real 500 lives, and neither Stryker nor fast-check will find them: Stryker mutates
one line, fast-check generates one call's arguments.

### Schemathesis

Python, open source, reads `openapi.yaml` and generates request sequences plus schema-conformance
checks. Runs as a CLI in CI — no Python in the app, just in the workflow.

```bash
schemathesis run openapi.yaml \
  --url http://localhost:3000 \
  --checks all \
  --stateful=links \
  --hypothesis-derandomize
```

Two notes that decide whether it is worth it here:

- `--stateful=links` only follows **OpenAPI `links`**. The root bundle has to declare them
  (`createOrder` → `payOrder` → `cancelOrder`), which is contract work in
  `src/modules/*/openapi.yaml`, not test work. That work is worth doing on its own merits — it also
  documents the state machine for the frontend.
- `--hypothesis-derandomize` is what makes it CI-safe. Without it the seed moves and a failure is
  not reproducible, which is exactly the property that disqualifies AI tools from gating.

Cost: one workflow, one service container, no dependency in `package.json`.

**Status: installed.** `.github/workflows/schemathesis.yml` — nightly, Docker image, no Python
dependency added anywhere. The `links` it follows are declared per-module (see the "links-complete
contract" item below). See [Stateful fuzzing](docs/tools/fuzz-testing.md#stateful-fuzzing-sequences-not-single-requests).

### RESTler — rejected, unless the `links` work stalls

Microsoft, open source, infers the endpoint dependency graph _without_ declared links — it learns
that `POST /orders` returns an id that `POST /orders/{id}/pay` consumes. Slower, heavier, and its
output needs triage.

Adopting both is redundant: they answer the same question. Schemathesis wins because derandomised
runs and a clean exit code fit the existing CI shape, and because the `links` it needs are worth
declaring anyway. Revisit RESTler only if declaring those links turns out to be a bigger job than
expected.

---

## Smaller gaps, in order of payoff

**Order-dependence in the suite.** `--runInBand` on integration, contract and fuzz means shared
state can leak between tests and nobody would know. `jest --shard` or a randomised order flushes out
tests that only pass because a sibling ran first. Cheap to try, occasionally brutal.

**Status: installed.** `npm run test:order-random` — the same three suites, `--randomize --showSeed`.
Not part of `npm run test` or CI, by design: cheap enough to run by hand. See
[Order-dependence](docs/reference/tests.md#order-dependence).

**Money invariants as one shared property.** `totals.property.test.ts` and `money.property.test.ts`
are separate. A single "totals reconcile, rounding never invents a cent" property applied across
orders, cart, payments and delivery would cover the precedence rules that currently rely on
per-module examples.

**Status: installed**, short of a literal file merge. `totals.property.test.ts` and
`money.property.test.ts` test genuinely distinct pure functions (line aggregation vs. minor-unit
conversion) and stayed separate; the actual gap — a property proving the composition cart, payments
and delivery all rely on without calling one another — is closed by
`tests/cross-cutting/money-reconciliation.property.test.ts`, plus `rates.property.test.ts` for
delivery's own previously example-only free-shipping threshold.

**A `links`-complete contract.** Falls out of the Schemathesis work, but stands alone: right now the
state machine exists in the code and in prose, and nowhere a machine can read.

**Status: installed.** `createOrder`/`checkout` → `createPaymentIntent` → `confirmPayment` →
`refundPaymentByOrder`/`cancelOrderById`, declared in the leaf `openapi.yaml` fragments. See
[Declaring state-machine links](docs/api/openapi-workflow.md#declaring-state-machine-links).

---

## Considered and rejected

- **RESTler** — same job as Schemathesis. See above.
- **Dredd** — contract testing against OpenAPI, single request. `test:prism` and `jest-openapi`
  already cover it, with less setup.
- **A second property-testing library** — `fast-check` is installed and used in 8 files. The gap is
  which invariants are expressed, not which library expresses them.
- **Coverage thresholds as a gate** — `test:unit:coverage` exists and mutation score is the stronger
  signal. A line-coverage floor would add a number to argue about and no information.

## What none of these can do

Every tool above compares the system to **itself** — the code to the schema, a mutant to the suite,
one run to another. Not one of them can read `docs/theory/*.md` and notice that the prose promises a
rule the contract never encodes and the code never implements.

That gap is the whole reason for the audit prompts in `tests/audit/prompts`. The deterministic
layer shrinks it; it does not close it.
