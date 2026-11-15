---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: 602a2e5ac80ddf9777d9423a445d140da22554387a3f40f50821a2f6d98f9115
generated_at: 2026-11-14T23:09:39.338949+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose
Spec-driven fuzzing (L5): for every operation declared in `openapi.yaml`, generates hostile but spec-valid requests with `fast-check` and asserts the real app never returns 5xx and always matches the documented response contract. Auto-discovers operations via the spec walk, so new routes are covered without updating any test list.

## Key elements
- **`SEED`** – Reproducibility seed (from `RANDOM_DATA_SEED` env or random); logged to stdout so a failing nightly can be re-run.
- **`OPERATIONS` / `FUZZABLE`** – All operations from `listOperations()`; `FUZZABLE` excludes multipart.
- **`fuzzAs(operation, bearer, world, runs, check, variant)`** – Core helper: draws body + query via arbitraries, fires the request with the given credentials, and passes each response to the assertion callback.
- **`neverCrashesOffContract(response)`** – The invariant: status < 500 AND `assertResponseMatchesContract` passes.
- **`jsonBody` / `mergePatchBody`** – `BodyVariant` constructors selecting which declared content-type to fuzz.
- **`describe('the spec walk itself')`** – Meta-tests guarding the walk: operation count > 40, no unsupported JSON-Schema keywords, no ungeneratable regex patterns, multipart skip ratio is sane.
- **`describe.each(FUZZABLE.map(...))`** – One jest case per endpoint; each runs the fuzz for admin, customer, and no-credential callers.
- **`jest.mock('@infrastructure/adapters/pdf')`** – Stubs `renderHtmlToPdf` so the invoice route doesn't 500 on a missing browser.
- **`afterEach(settleInlineExports → emptyFileSandbox)`** – Waits for `POST /account/export` inline builds, then fails the run if any file remains.

## Relationships
- **`tests/support/spec-walk.ts`** – Supplies `listOperations`, `unsupportedKeywords`, `ungeneratablePatterns`, and the `Operation` / `SchemaNode` types that drive the entire sweep.
- **`tests/support/spec-arbitraries.ts`** – Provides `bodyArbitraryFor` and `queryArbitraryFor`, the `fast-check` generators that produce spec-valid (but hostile) payloads.
- **`tests/support/spec-world.ts`** – `seedWorld`, `buildUrl`, `requiredHeadersOf`, and the `World` type give path-parameter values (real seeded rows) so handlers run past their 404 checks.
- **`tests/support/http.ts`** – `api()` (supertest wrapper) and `authenticateAs` for issuing requests and attaching bearer tokens.
- **`tests/support/response-contract.ts`** – `assertResponseMatchesContract` validates status + body against orval-generated Zod schemas; imported directly (not via the `@tests/contract` re-export) so `fast-check` can shrink a mismatch to the minimal failing input.
- **`tests/support/knobs.ts`** – `FUZZ_RUNS_PER_OPERATION` controls how many requests are drawn per caller.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions the test database before the suite runs.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` is called in `afterEach` to fail the run if any test caused an uncleaned file.
- **`src/infrastructure/runtime/readiness.ts`** – `markServerListening()` is called once so `GET /readyz` returns 200 instead of 503 during the sweep.
- **`src/modules/account/services/export.ts`** – `settleInlineExports()` awaits in-flight inline export builds started by a fuzzed `POST /account/export` before the sandbox is checked.

## Notes
- The multipart *file* half is deliberately skipped (no meaningful `fast-check` arbitrary for binary uploads); the count is asserted so "skipped" can't silently become "skipped everything."
- Multipart operations are additionally sent as `application/x-www-form-urlencoded` to verify the 415 content-type guard fires before any controller logic.
- The `@tests/contract` wrapper is intentionally *not* imported: its automatic `afterEach` would judge responses a second time and prevent `fast-check` from shrinking failures to the minimal input.
- Runs at a small default in `npm run test` (merge gate) and a much larger count in the nightly workflow (`.github/workflows/fuzz.yml`).
- `REFUSED_CALLER_RUNS` is `FUZZ_RUNS_PER_OPERATION / 4` (min 1): the refusal path rarely depends on body content, so fewer draws suffice.
