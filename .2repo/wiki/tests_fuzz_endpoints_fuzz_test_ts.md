# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven fuzzing harness that generates `fast-check`-valid but hostile requests for every operation in `openapi.yaml` and asserts two invariants: no 5xx response, and the response matches the spec (status code and shape). Operations are auto-discovered via `listOperations()`, so any new route added to the spec is covered on the next run with no test to write. Runs nightly or via `npm run test:fuzz`, not as part of the CI gate.

## Key elements

- **`SEED`** — Resolves `RANDOM_DATA_SEED` env var or generates a random seed; always logs it to `console` (bypassing any mocked logger) so a failing nightly is reproducible.
- **`OPERATIONS`** — Full list from `listOperations()`; used by the guard tests and the fuzz suite.
- **`FUZZABLE`** — `OPERATIONS` filtered to exclude `isMultipart` operations.
- **`buildUrl(operation)`** — Replaces `{param}` path placeholders with a valid ObjectId (or `'tok'` for token-like params) so requests reach the handler instead of a CastError.
- **`RUNS_PER_OPERATION`** (12) — `fast-check` iteration count per operation; deliberately low because each run hits a real in-memory Mongo.
- **`describe('the spec walk itself')`** — Three guard assertions: ≥ 40 operations found, no unsupported JSON Schema keywords, and multipart skips are bounded (neither zero nor the majority).
- **`describe.each(FUZZABLE…)`** — One Jest case per operation (`METHOD /path`). Each case calls `fc.assert` with `endOnFailure: true`, 120 s timeout, and checks `status < 500` plus `toSatisfyApiSpec()`.

## Relationships

- **`tests/support/contract.ts`** — Imported purely for its side effect: it calls `jestOpenAPI(openapi.yaml)`, registering the `toSatisfyApiSpec()` matcher used in every fuzz assertion.
- **`tests/support/http.ts`** — Provides `api()` (supertest instance) and `authenticateAs('admin')` for the Bearer token.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` boots the in-memory Mongo used by every request.
- **`tests/support/spec-walk.ts`** — Source of `listOperations()`, `unsupportedKeywords()`, and the `Operation` type.
- **`tests/support/spec-arbitraries.ts`** — `bodyArbitraryFor(operation.bodySchema)` produces the `fast-check` arbitrary that drives request bodies.

## Notes

- **Not a gate.** Failures are treated as *findings* for a human, not merge blockers. Same philosophy as mutation testing.
- **Seed is random by default.** A fixed seed would make this a regression test "wearing a fuzzer's name." The seed is logged so a nightly failure is reproducible by pasting the value into `RANDOM_DATA_SEED`.
- **Multipart is skipped, but the skip is asserted.** The guard test verifies the skipped count is > 0 and < ¼ of all operations, so a spec edit cannot silently remove all coverage.
- **120 s per operation timeout.** With 55+ operations × 12 runs against a real Mongo, this is a long file to run locally.
- **`endOnFailure: true`** — `fast-check` stops at the first failing case per operation rather than burning the full 12 runs.
- **`docs/theory/request-flow.md`** appears in the dependency graph but is not imported or referenced in this file; no runtime interaction.
