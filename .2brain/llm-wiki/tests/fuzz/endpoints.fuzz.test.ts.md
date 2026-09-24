---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: d6519b2220fdee2e341c2828674a0fecc01775d826c16bc589d3ac141459601f
generated_at: 2026-09-23T20:01:40.361060+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven fuzz test (L5) that fires `fast-check`-generated, spec-valid-but-hostile requests at every operation declared in `openapi.yaml` and asserts (1) the server never returns 5xx and (2) the response shape and status match the OpenAPI contract. Operations are auto-discovered by walking the spec, so new routes are covered on the next run without any list to update.

## Key elements

- **`SEED`** (IIFE) — Reads `RANDOM_DATA_SEED` from the environment or rolls a random 32-bit seed; logs it to the terminal (bypassing the logger mock) so a nightly failure is reproducible.
- **`buildUrl(operation)`** — Substitutes path parameters with well-formed values (`OBJECT_ID` or `'tok'`) so requests reach the handler instead of failing at URL parsing.
- **`NO_BODY`** — `fc.constant(undefined)` placeholder for operations whose spec declares no request body.
- **`FUZZABLE`** — `OPERATIONS` filtered to exclude `multipart/form-data` operations (fast-check cannot meaningfully generate file bodies).
- **`describe.each(FUZZABLE …)`** — One jest case per operation; each runs `fc.assert` with `bodyArbitraryFor(operation.bodySchema)`, asserting `< 500` and `toSatisfyApiSpec()`. Uses `endOnFailure: true` and a 120 s timeout.
- **`describe('the spec walk itself', …)`** — Meta / tripwire tests: asserts the walk found > 40 operations, that `unsupportedKeywords()` and `ungeneratablePatterns()` are both empty, and that the multipart skip count is bounded (neither zero nor > 25 % of all ops). These guard against the fuzzer silently passing while generating nothing useful.

## Relationships

| Neighbor                            | Interaction                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/support/spec-walk.ts`        | Provides `listOperations()`, `unsupportedKeywords()`, `ungeneratablePatterns()`, and the `Operation` type that drive the entire test.   |
| `tests/support/spec-arbitraries.ts` | Provides `bodyArbitraryFor(schema)` which converts an OpenAPI body schema into a `fast-check` Arbitrary.                                |
| `tests/support/http.ts`             | Provides `api()` (supertest agent) and `authenticateAs('admin')` for the bearer token.                                                  |
| `tests/support/contract.ts`         | Imported **for side effect only**: its module body calls `jestOpenAPI(openapi.yaml)`, which registers the `toSatisfyApiSpec()` matcher. |
| `tests/support/setup-test-db.ts`    | `setupTestDb()` is called at module scope to prepare the test database before any case runs.                                            |
| `tests/support/knobs.ts`            | Supplies `FUZZ_RUNS_PER_OPERATION`, the `fast-check` iteration count per operation.                                                     |

## Notes

- **Not in `npm run test`.** Runs nightly or via `npm run test:fuzz`. Treated as a _hunter_ (finds bugs for a human to triage), not a merge gate — same rationale as mutation testing.
- **Multipart is skipped by design.** File bodies (PNGs, etc.) are outside `fast-check`'s domain; the upload path is covered separately by `tests/integration/upload-security.test.ts`. The skip count is asserted so "skipped" can't silently become "skipped everything."
- **Seed is rolled per run, not fixed.** A pinned seed would re-test the same ~660 requests forever, reducing the fuzzer to a regression test. The logged seed (and the shared `RANDOM_DATA_SEED` env var name) is the reproduction mechanism.
- **Tripwire tests exist because a silent spec-walk failure looks green.** If `listOperations()` returns an empty array, or the arbitrary builder hits an unsupported keyword and omits fields, every endpoint 422s and the suite passes. The meta-tests in `'the spec walk itself'` catch both failure modes.
- The `console.log` for the seed carries an explicit `eslint-disable no-console` comment because the standard logger may be mocked in the test environment.
