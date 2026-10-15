---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: 5e3d9251167a80b9acb0a391ee3f55ea7d1f79dd2dd8be9fc5f06b45247b289e
generated_at: 2026-10-15T12:42:31.632959+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven fuzzing suite (L5) that auto-discovers every operation in `openapi.yaml` via `listOperations()`, then fires generated spec-valid but hostile requests at the real app. It asserts two invariants per response: no 5xx status, and the response matches the documented contract (status code + body shape). It runs in `npm run test` (merge gate) at a small default and nightly at a larger `FUZZ_RUNS_PER_OPERATION`. Each operation is exercised as admin, as a plain customer, and with no credentials.

## Key elements

- **`SEED`** — Resolved from `RANDOM_DATA_SEED` env var or a fresh random value; logged to `console.log` for reproducibility. Passed to every `fc.assert` call.
- **`OPERATIONS`** — Result of `listOperations()`; the full list of OpenAPI operations this suite covers.
- **`FUZZABLE`** — `OPERATIONS` filtered to exclude `isMultipart` operations (their file-upload half is handled by `tests/integration/upload-security.test.ts`).
- **`fuzzAs(operation, bearer, world, runs, check, variant)`** — Core driver. Builds a `fc.asyncProperty` over `bodyArbitraryFor` + `queryArbitraries`, sends each drawn request via the `api()` supertest helper, and hands the response to `check`.
- **`neverCrashesOffContract(response)`** — The shared assertion: `status < 500` and `assertResponseMatchesContract(response)`.
- **`describe('the spec walk itself')`** — Meta-tests guarding the generator: operation count > 40, no unsupported keywords, no ungeneratable patterns, multipart skip is bounded.
- **`describe.each(FUZZABLE…)`** — One jest case per operation × three caller roles. The last `describe.each` (truncated) sends multipart operations as `application/x-www-form-urlencoded` to exercise the 415 guard.
- **`BodyVariant`** / `jsonBody` / `mergePatchBody` — Selects which declared request body schema (and `Content-Type`) a fuzzed request carries.
- **`jest.mock('@infrastructure/adapters/pdf')`** — Replaces the PDF renderer with a stub returning a fixed buffer so invoice routes don't 500 on the real PDF adapter.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (supertest instance) and `authenticateAs()` for role-based callers.
- **`tests/support/response-contract.ts`** — `assertResponseMatchesContract` is called *inside* the property function (not via the `@tests/contract` afterEach wrapper) so `fast-check` can shrink a mismatch.
- **`tests/support/spec-walk.ts`** — `listOperations`, `ungeneratablePatterns`, `unsupportedKeywords`, and the `Operation`/`SchemaNode` types drive the entire suite.
- **`tests/support/spec-arbitraries.ts`** — `bodyArbitraryFor` and `queryArbitraryFor` build `fast-check` arbitraries from the Zod schemas.
- **`tests/support/spec-world.ts`** — `seedWorld`, `buildUrl`, `requiredHeadersOf` produce real DB rows for path params and the correct URL/headers per operation.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory test database before any test runs.
- **`tests/support/knobs.ts`** — `FUZZ_RUNS_PER_OPERATION` controls the number of generated requests per operation.
- **`src/infrastructure/runtime/readiness.ts`** — `markServerListening()` is called so `/readyz` returns 200 instead of 503 (which would trip the "no 5xx" invariant on every run).
- **`tests/cross-cutting/guarded-steps-stay-unpublished.test.ts`** — Related cross-cutting test; shares the same HTTP harness and response-contract judge conventions.

## Notes

- The suite deliberately imports `assertResponseMatchesContract` directly rather than `@tests/contract`'s wrapper, because the wrapper's automatic `afterEach` would double-judge responses and prevent `fast-check` from shrinking a failing input.
- `SEED` is rolled fresh each run by design; a fixed seed would make the fuzzer a regression test. The seed is logged via raw `console.log` (eslint-suppressed) so it survives even when the app logger is mocked.
- `REFUSED_CALLER_RUNS` is `ceil(FUZZ_RUNS_PER_OPERATION / 4)` — the non-admin passes run fewer requests because the refusal path rarely depends on body content.
- Multipart file-upload operations are excluded from the admin/customer/no-auth sweep, but they *are* exercised as `urlencoded` in a separate `describe.each` to hit the 415 guard.
- A `GET /readyz` would 503 under `NODE_ENV=test` without the explicit `markServerListening()` call; this is a one-time bootstrap, not per-test.
