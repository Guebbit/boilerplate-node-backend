---
source: tests/fuzz/endpoints.fuzz.test.ts
sha256: f523ac31adbb03d797968904b8a4c9b641a610c9239016e42af010869ea7fb43
generated_at: 2026-10-29T06:51:38.135754+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/endpoints.fuzz.test.ts

## Purpose

Spec-driven property-based fuzzing (L5): for every operation declared in `openapi.yaml`, it throws generated spec-valid-but-hostile requests at the real app and asserts (1) no 5xx and (2) the response matches the contract. Auto-discovery via `listOperations()` means any new route in the spec is covered on the next run with no manual list to update. Runs in the merge gate at a small `FUZZ_RUNS_PER_OPERATION` default and nightly at a much larger count.

## Key elements

- **`SEED`** — Reproducibility seed; rolled fresh per run unless `RANDOM_DATA_SEED` is set. Logged to stdout before any case runs.
- **`OPERATIONS`** — All operations from `listOperations()`; the source of truth for what is tested.
- **Guard tests (`describe('the spec walk itself')`)** — Tripwires that fail if the walker finds nothing, encounters an unsupported JSON Schema keyword, or hits an ungeneratable `pattern`, preventing silent "green but testing nothing."
- **`FUZZABLE`** — `OPERATIONS` minus multipart operations (file-upload body is skipped; upload security is covered by a dedicated integration test).
- **`REFUSED_CALLER_RUNS`** — Reduced run count for the two unprivileged callers (admin / customer / none).
- **`fuzzAs(operation, bearer, world, runs, check, variant)`** — Core engine: builds the URL from a seeded `World`, draws body + query via `fast-check` arbitraries, fires the request through the supertest `api()`, and hands the response to `check`.
- **`neverCrashesOffContract(response)`** — The assertion every response must pass: status < 500 and `assertResponseMatchesContract` succeeds.
- **`describe.each(FUZZABLE …)`** — One jest case per operation so a failure names the endpoint. Each case fires three fuzz passes (admin, customer, no credentials) plus a `PATCH` merge-patch variant where declared.
- **Multipart-as-urlencoded `describe.each`** — Sends the same hostile arbitrary as `application/x-www-form-urlencoded` (a type none of them declare) to verify the 415 guard fires before any controller runs.
- **`jest.mock('@infrastructure/adapters/pdf')`** — Replaces the PDF renderer with a static buffer so invoice routes return 200 instead of 500 in the test environment.
- **`afterEach(settleInlineExports → emptyFileSandbox)`** — Drains any in-flight `POST /account/export` build and asserts the file sandbox is empty.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/spec-walk.ts` | Source of `listOperations`, `unsupportedKeywords`, `ungeneratablePatterns`, and the `Operation` / `SchemaNode` types that drive the entire sweep. |
| `tests/support/spec-arbitraries.ts` | `bodyArbitraryFor` and `queryArbitraryFor` build the `fast-check` arbitraries from each operation's schemas. |
| `tests/support/spec-world.ts` | `seedWorld` creates the `World` of real row IDs; `buildUrl` and `requiredHeadersOf` shape the request. |
| `tests/support/response-contract.ts` | `assertResponseMatchesContract` is called directly inside the property (not via `afterEach`) so `fast-check` can shrink to the minimal failing input. |
| `tests/support/http.ts` | `api` (supertest) and `authenticateAs` (admin/customer tokens) provide the transport and identity for all three caller passes. |
| `tests/support/knobs.ts` | `FUZZ_RUNS_PER_OPERATION` controls how many draws per operation; `REFUSED_CALLER_RUNS` derives a smaller count. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database before any case runs. |
| `src/infrastructure/runtime/readiness.ts` | `markServerListening()` flips the readiness flag so `GET /readyz` returns 200 instead of tripping the no-5xx invariant. |
| `src/modules/account/services/export.ts` | `settleInlineExports()` waits for the background export build started by a fuzzed `POST /account/export`. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox()` is called after settlement to fail the run if any test left a file behind. |

## Notes

- **Multipart gap is intentional and bounded.** The file-upload body of `multipart/form-data` operations is skipped because `fast-check` cannot generate meaningful binary files; the guard test asserts the skipped count is > 0 but < ¼ of total operations, so "skip" cannot silently grow to "skip everything."
- **Contract assertion is inline, not in `afterEach`.** Importing from `@tests/contract` would register an automatic `afterEach` judge that fires outside `fast-check`'s control, breaking counter-example shrinking. `assertResponseMatchesContract` is called directly inside the property function.
- **PDF adapter is mocked.** Without the mock, the invoice route (which renders a real order to PDF) would 500 in the test environment, producing a false failure. The mock returns a static buffer.
- **Seed is logged with `console.log`** (eslint-suppressed) because the logger may be mocked in the test environment, but the seed must reach the terminal for reproduction.
- **Three caller identities per operation.** Admin reaches the deepest code path; customer and no-credentials verify that the spec-documented 401/403 refusal fires rather than a crash or an unintended 200.
- **Path and id parameters name real rows** from the seeded `World`, so handlers execute past their 404 guard and into real logic. Remaining query fields are drawn from the spec.
