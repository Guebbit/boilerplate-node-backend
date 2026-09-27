---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: 68fbefbab4f0f032d05c51eecbb06ec6532c7678a28dfda37e8a921cabead7aa
generated_at: 2026-09-27T15:53:52.069698+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven fuzzing (L5): for every operation declared in `openapi.yaml`, it fires spec-valid but hostile requests at the running app (via supertest) and asserts that no response is a 5xx and that every response conforms to the spec's status codes and schemas. Because the operation list comes from `listOperations()` (a spec walk), any route added to `openapi.yaml` is covered automatically without updating a test list. Each operation is fuzzed as an admin, a plain customer, and with no credentials.

## Key elements

- **`SEED`** — One `fast-check` seed per run. Pinned by `RANDOM_DATA_SEED` env var or rolled randomly; always logged so a failure is reproducible.
- **`OPERATIONS`** — The full list from `listOperations()`; the driving set for every `describe.each`.
- **`FUZZABLE`** — `OPERATIONS` minus multipart operations (file-upload half is excluded).
- **`seedWorld(owner)`** — Creates a product, an order (owned by `owner`), and a second user via test factories; returns their IDs so path parameters name real rows.
- **`parameterValue(path, name, world)`** — Resolves a single path parameter to a literal (`LITERAL_PARAMETERS`), a seeded row ID, or a well-formed-but-unowned ObjectId.
- **`buildUrl(operation, world)`** — Substitutes all `{param}` placeholders in an operation's path.
- **`fuzzAs(operation, bearer, world, runs, check)`** — The core loop: runs `fc.asyncProperty` drawing body + query arbitraries, fires requests as the given caller, and passes each response to `check`.
- **`"the spec walk itself"`** — Four tripwire tests: operation count > 40, no unsupported JSON-Schema keywords, no ungeneratable patterns, and multipart skip count is bounded.
- **S13 `describe.each`** (truncated) — Re-fuzzes multipart operations as `application/x-www-form-urlencoded` to cover the string-transport decode path.

## Relationships

- **`tests/support/spec-walk.ts`** — Provides `listOperations`, `ungeneratablePatterns`, `unsupportedKeywords`, and the `Operation` type that drive the entire suite.
- **`tests/support/spec-arbitraries.ts`** — Supplies `bodyArbitraryFor` and `queryArbitraryFor`, which turn spec schemas into `fast-check` arbitraries.
- **`tests/support/contract.ts`** (via `@tests/response-contract`) — `assertResponseMatchesContract` is called inline inside the property function (not in an `afterEach`) so `fast-check` can shrink failures.
- **`tests/support/http.ts`** — `api` (supertest wrapper) and `authenticateAs` (bearer-token helper) are the transport layer.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a fresh test database.
- **`tests/support/knobs.ts`** — `FUZZ_RUNS_PER_OPERATION` sets the run count; `REFUSED_CALLER_RUNS` derives a smaller count for the two non-admin passes.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** — `createUser`, `createProduct`, `createOrder`, `toOrderItem` seed the rows that path parameters reference.
- **`src/modules/users/index.ts`** / **`src/modules/users/model.ts`** — `UserDocument` type used by `seedWorld`'s parameter.
- **`src/infrastructure/runtime/readiness.ts`** — `markServerListening()` is called once so `GET /readyz` returns 200 instead of tripping the no-5xx invariant.
- **`scripts/docs/generate-role-matrix.ts`** — Shares the same spec-walk vocabulary (operation listing); listed as a graph neighbor via the shared `spec-walk` dependency.

## Notes

- **Multipart file uploads are skipped.** The file half of `multipart/form-data` operations is excluded (no useful `fast-check` arbitrary for binary content); the skip count is bounded by a test so the exclusion cannot silently grow.
- **PDF adapter is mocked.** `renderHtmlToPdf` resolves a stub buffer; the real invoice render path is covered elsewhere.
- **`markServerListening()` is called manually.** Under `NODE_ENV=test` the real boot never runs, so the readiness endpoint would 503 and fail the no-5xx assertion on every fuzz run.
- **The response contract judge is called inline, not in `afterEach`.** Importing from `@tests/contract` would trigger an automatic `afterEach` that judges responses a second time, breaking `fast-check` shrinking. The file explicitly imports `assertResponseMatchesContract` from `@tests/response-contract` instead.
- **Runs in two modes.** Small `FUZZ_RUNS_PER_OPERATION` default in `npm run test` (merge gate); a much larger value in `.github/workflows/fuzz.yml` (nightly). A failure is treated as a real finding.
- **`LITERAL_PARAMETERS`** hard-codes a few non-id path params (`locale`, `entityType`, `method`, `provider`) so the generator doesn't have to invent them.
