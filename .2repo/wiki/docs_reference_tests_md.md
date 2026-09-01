# docs/reference/tests.md

## Purpose

Documents the test suite architecture: where tests live (co-located vs. `tests/`), the hierarchy of suites (unit → cross-cutting → integration → contract → fuzz), and the project's stance on mutation testing as the primary quality instrument over coverage as a proxy. Exists so a reader can identify *which* test guarantees a specific rule without opening the file.

## Key elements

- **Scope split rule** — Module-internal tests live beside the module; system-wide tests (infrastructure, kernel, cross-module invariants) live under `tests/`. Enforced by `eslint-plugin-boundaries` in `eslint.config.ts`.
- **Suite hierarchy** — `tests/unit` → `tests/cross-cutting` → `tests/integration` → `tests/contract` → `tests/fuzz`, plus `tests/support` (harness, no assertions) and co-located module suites.
- **Three metrics, ranked** — Pass rate (must be 100%, always), mutation score (does a test *notice* a change — the real signal), coverage (did a line execute — weaker proxy). Mutation score subsumes coverage.
- **Cross-cutting test files** — One file per architectural rule, asserted across all thirteen modules simultaneously. Examples: `locale-namespaces.test.ts`, `locale-parity.test.ts`, `audit-actions.test.ts`, `contract-bundles.test.ts`, `contract-scalars.test.ts`, `seed-conformance.test.ts`, `process-snapshot.test.ts`, `authenticated-controllers.test.ts`, `ci-covers-the-gate.test.ts`.
- **Commands** — `npm run test` (all suites, the gate), `npm run test:mutation` (Stryker, primary quality judgement), `npm run test:unit:coverage` (fast proxy, seconds-long).
- **`mutation-baseline.json`** — Per-file mutation scores; used as a ratchet, not an absolute grade. 153 of 254 files currently score 0% due to suite-selection blind spots.

## Relationships

- **`docs/reference/src-app.md`** — `locale-namespaces.test.ts` asserts locale keys stay within their module's namespace relative to the app/kernel/types bundle.
- **`docs/reference/src-modules.md`** — `locale-parity.test.ts` asserts key parity across every module; module scope split is the organizing principle this page defines.
- **`docs/reference/contracts.md`** — `contract-bundles.test.ts` and `contract-scalars.test.ts` verify bundled documents and shared scalars against the contract spec.
- **`docs/reference/data.md`** — `seed-conformance.test.ts` verifies the demo dataset conforms to the contract it exemplifies.
- **`docs/reference/scripts.md`** — `ci-covers-the-gate.test.ts` asserts every check in `npm run complete` has a CI job; `mutation.yml` is nightly and `continue-on-error`.
- **`docs/api/observability.md`** — `process-snapshot.test.ts` guarantees the SSE frame and REST payloads cannot drift from the single published process shape.
- **`docs/theory/request-flow.md`** — `authenticated-controllers.test.ts` asserts controllers using `authContextOf` are mounted behind `isAuth`, including mid-file `router.use` cases.
- **`docs/tools/cluster-testing.md` / `docs/tools/concurrency-testing.md`** — Integration and fuzz suites (which these tools exercise) are excluded from the unit-coverage run and, as noted, from Stryker's test selection, creating the documented blind spots.
- **`docs/reference/index.md`** — Parent index; this page is one entry in the reference set.

## Notes

- **Stryker blind spot (still open):** `stryker.config.json` mutates `src/modules/*/**/*.ts` (services, repositories) but its `testPathIgnorePatterns` excludes `tests/integration/`, `tests/contract/`, and co-located equivalents. Mutants in those files survive by construction. Read `mutation-baseline.json` scores as relative ratchets, not absolute grades, until suite selection is revisited.
- **Low unit-coverage numbers are expected:** Thirty-six module specs were moved to `tests/integration/` to avoid repeated DB startup under Stryker. The unit-coverage run therefore does not execute those specs; floors were re-fitted downward on 2026-08-29 after a months-long red gate.
- **Combined coverage run is not viable:** Attempted and abandoned — V8 fatal assertion with the fuzz suite, OOM at ~4 GB without it. Do not re-attempt without per-suite merged reports and enlarged heap.
- **No tolerance for failing tests:** A single failing test is a red build. A test is fixed or deleted; no known-failing state is tolerated.
