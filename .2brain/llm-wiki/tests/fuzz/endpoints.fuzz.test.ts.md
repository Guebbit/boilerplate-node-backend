---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: f523ac31adbb03d797968904b8a4c9b641a610c9239016e42af010869ea7fb43
generated_at: 2026-11-08T09:34:25.215883+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven fuzzing (L5): for every operation declared in `openapi.yaml`, generates hostile but spec-valid requests via `fast-check` and asserts they never produce a 5xx and always match the response contract (status + body schema). Auto-discovers operations from the spec so newly added routes are covered with no manual list to maintain.

## Key elements

- **`SEED`** – Reproducibility seed; rolled fresh per run unless `RANDOM_DATA_SEED` is set. Logged to the terminal for pasting into a rerun.
- **`OPERATIONS`** – All operations from `listOperations()`. **`FUZZABLE`** – subset excluding `isMultipart`.
- **`REFUSED_CALLER_RUNS`** – Reduced run count (`ceil(FUZZ_RUNS / 4)`) for the two non-admin callers, since refusal rarely depends on the body.
- **`BodyVariant` / `jsonBody` / `mergePatchBody`** – Select which declared request body schema and `Content-Type` a fuzzed request carries.
- **`fuzzAs(operation, bearer, world, runs, check, variant)`** – Core loop: builds the URL with real row IDs from the seeded `World`, draws body + query via `fast-check` arbitraries, fires the request through the supertest `api()` helper, and hands each response to `check`.
- **`neverCrashesOffContract(response)`** – The two invariants: status < 500, and `assertResponseMatchesContract` passes.
- **`describe('the spec walk itself')`** – Guard tests: operation count > 40, zero unsupported keywords, zero ungeneratable patterns, and that only multipart operations are skipped.
- **`describe.each` (fuzzable)** – One Jest case per operation, fuzzed as admin, customer, and unauthenticated.
- **`afterEach`** – Awaits `settleInlineExports()` then calls `emptyFileSandbox()` so stray export files fail the run.
- **`jest.mock('@infrastructure/adapters/pdf')`** – Replaces real Chromium PDF rendering with a stub buffer.
- **`markServerListening()`** – Marks the process ready so `/readyz` returns 200 instead of 503 during the sweep.

## Relationships

- **`tests/support/spec-walk.ts`** – Provides `listOperations`, `ungeneratablePatterns`, `unsupportedKeywords`, and the `Operation` / `SchemaNode` types that drive the entire sweep.
- **`tests/support/spec-arbitraries.ts`** – `bodyArbitraryFor` and `queryArbitraryFor` turn spec schemas into `fast-check` arbitraries.
- **`tests/support/spec-world.ts`** – `seedWorld` creates real row IDs for path parameters; `buildUrl` and `requiredHeadersOf` assemble the request target.
- **`tests/support/http.ts`** – `api()` (supertest client) and `authenticateAs` (bearer-token helpers) for the three caller identities.
- **`tests/support/response-contract.ts`** – `assertResponseMatchesContract` judges each response against the orval-generated per-status Zod schemas.
- **`tests/support/knobs.ts`** – `FUZZ_RUNS_PER_OPERATION` sets the per-operation run count (small default in CI, larger nightly).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions the test database before any request fires.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox()` in teardown fails the run if a test left a file behind.
- **`src/infrastructure/runtime/readiness.ts`** – `markServerListening()` satisfies `/readyz` without running the full boot path.
- **`src/modules/account/services/export.ts`** – `settleInlineExports()` waits for the async export build started by `POST /account/export` before the next case runs.

## Notes

- The contract judge is imported directly (`assertResponseMatchesContract`) rather than via `@tests/contract`; the latter's automatic `afterEach` would double-judge the same response and break `fast-check`'s shrinking.
- Multipart operations are **excluded** from the main fuzz (the file half is covered by `tests/integration/upload-security.test.ts`), but a second `describe.each` sends the same hostile body as `application/x-www-form-urlencoded` to exercise the 415 guard.
- The seed is deliberately rolled per run: a fixed seed turns the fuzzer into a regression test. Reproducibility is handled by logging the seed.
- `endOnFailure: true` is passed to every `fc.assert` call, so the first failing case stops that operation's fuzz rather than continuing to the `numRuns` limit.
