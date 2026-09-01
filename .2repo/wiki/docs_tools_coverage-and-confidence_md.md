# docs/tools/coverage-and-confidence.md

## Purpose

Establishes the ranking and relationships between the three quality numbers in this repo (pass rate, mutation score, coverage), declares mutation testing the primary instrument, defines what counts as true vs. false redundancy, and records the known blind spot where mutation testing currently cannot execute the suites that would kill service-layer mutants. It exists so the hierarchy is not re-litigated and so readers pick the correct number for a given question.

## Key elements

- **Three-number ranking table** — pass rate (absolute, no threshold) > mutation score (the verdict) > coverage (smoke alarm / ratchet only).
- **Subsumption principle** — mutation score subsumes coverage (an uncovered line guarantees surviving mutants, but a covered line with no assertion appears only in the mutation score); integration does *not* subsume unit; contract does *not* subsume integration.
- **Redundancy rule** — two checks are redundant only if passing the stronger one makes failing the weaker one impossible; otherwise both earn their place.
- **Stryker thresholds** (`stryker.config.json`): `high: 80`, `low: 60`, `break: 60`. Colour the report and gate the run; explicitly not comparable to a coverage percentage.
- **Blind-spot section** — unit-scope mutation run excludes integration/contract suites, so 153 of 254 baseline files sit at 0% because their killing tests are never executed, not because tests are weak.
- **`mutation-baseline.json` vs `mutation-baseline-deep.json`** — the former is unit-scope (a 0% on a service file means "unmeasured"); the latter includes integration/contract and a 0% there is a real finding.
- **`maxTestRunnerReuse: 1` fix** (`stryker.deep.json`) — restarts the test runner per mutant to prevent bson's 17 MiB module-scope scratch buffer from accumulating across mutants; eliminates the OOM loop that previously made deep runs infeasible.
- **Coverage floors in `jest.config.js`** — ratchet ("do not get worse"), never a target, re-fitted 2026-08-29 to what the unit-coverage run actually measures.

## Relationships

- **`docs/tools/mutation-testing.md`** — the operational counterpart. This page states *why* mutation testing is the primary instrument and *how to read* its numbers; that page covers the run mechanics, the three-run schedule, the baseline-ratchet script (`check-mutation-baseline.ts`), and the full OOM investigation. This page links to it for those details and defers the "how" to it.
- **`docs/tools/unit-testing.md`** — referenced in the redundancy discussion: unit and integration tests over the same service are *not* redundant because they fail differently (calculation wrong vs. router never calls it).
- **`docs/tools/integration-testing.md`** — same redundancy discussion; also the source of the OOM when loaded into Stryker's unit-scope run.
- **`docs/tools/contract-testing.md`** — distinguished from integration testing: contract checks response shape against `openapi.yaml` (consumed by a second repo); integration exercises the full request path. Neither subsumes the other.
- **`docs/tools/fuzz-testing.md`** — distinguished from all hand-written tests: generated hostile input against the spec covers cases nobody wrote a test for; also the cause of the V8 fatal assertion when all suites are combined under one coverage run.
- **`docs/reference/tests.md`** — the file-by-file suite inventory. This page links to it as the "where each suite lives" reference; it does not duplicate that listing.

## Notes

- A 0% in `mutation-baseline.json` on a controller, service, or repository file means **unmeasured** (the unit-scope run never executes the tests that cover it), *not* untested. Read `mutation-baseline-deep.json` for those files.
- Stryker's `break: 60` threshold is a hard gate on the mutation run, not a "quality grade." It is categorically different from a 60% coverage floor.
- `STRYKER_WORKER_HEAP_MB` is deliberately left unset in `.env` because `ArrayBuffer` backing stores (bson) live outside V8's old-space heap; raising the heap cap does not stop RSS growth and only delays the crash.
- A single combined coverage run across all suites was attempted and abandoned: V8 fatal assertion with the fuzz suite, ~4 GB OOM without it. Do not retry without per-suite runs and merged reports.
- The coverage run (`test:unit:coverage`) does **not** include integration or contract suites, so a service covered only by integration specs reads near zero. That is a property of the run, not of the code.
