# docs/tools/property-testing.md

## Purpose

Documentation page that explains the repo's property-based testing approach: the rationale (generation + shrinking vs. sampled examples), the two determinism rules, the division of labor with example-based tests, and the map of where property test files live. Exists so a contributor can adopt the technique consistently without re-deriving conventions.

## Key elements

- **Two determinism rules** — (1) fix a seed at the top of every property file; (2) when generation finds a failure, commit the counterexample as an ordinary example alongside the general property.
- **Target criteria** — a function is a good property target when it is pure, total, and rich in invariants (idempotence, non-mutation, algebraic laws). A single-input assertion is an example, not a property.
- **The split with example tests** — example files own named cases, timing assertions, and historical inputs; property files own totality, generated combinations, and algebraic laws. Duplicate assertions are explicitly discouraged because the static mutant replays the full suite.
- **Running budget** — `numRuns` stays modest for the pre-commit path; raise it only while hunting a specific bug.
- **File map** — lists the four property/example test files in this repo (`totals.property.test.ts`, `serialize.property.test.ts`, `search.property.test.ts`, `search-regex.test.ts`) and notes the paired frontend applies the same technique to `utils/formatters.ts` and `utils/uploads.ts`.

## Relationships

- **`./unit-testing.md`** — the example-based layer that sits alongside property tests; this page defines what each side owns.
- **`./mutation-testing.md`** — referenced as the mechanism that makes duplicate assertions expensive (the static mutant replays the entire suite).
- **`./fuzz-testing.md`** — same generation-and-shrink idea applied to HTTP endpoints rather than pure functions.
- **`./testing-and-docs.md`** — the overall testing map this page plugs into.
- **`fast-check`** (library, not a repo file) — the property-testing engine whose seed and `numRuns` conventions this page governs.

## Notes

- This is a **documentation page**, not a code module; there are no exports or functions to import.
- The page cites a concrete historical motivation: `responseSchemaMap.ts` in the paired frontend went from 55 % to ~96 % mutation score after replacing sampled tests with exhaustive generation.
- The "wrong test" anecdote (secret `"p"` appearing inside the key `"password"`) is the canonical warning: verify that a property asserts what you think it asserts, not just that it passes.
