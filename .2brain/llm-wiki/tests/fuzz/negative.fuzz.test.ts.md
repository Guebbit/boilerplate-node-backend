---
source: tests/fuzz/negative.fuzz.test.ts
sha256: 85049df27c8be1dd2abf6ee01cd1459d000c54af65803e78d5721f11a0f1deae
generated_at: 2026-11-14T23:10:12.515952+00:00
model: ollama:qwen3.8:27b
---

# tests/fuzz/negative.fuzz.test.ts

## Purpose

Negative fuzzing test that replaces path and query parameters with values the OpenAPI spec does not allow, asserting the server never returns 5xx and returns 4xx whenever the parameter's schema is closed (enum, number, boolean, contract id). It complements the valid-value fuzzer (`endpoints.fuzz.test.ts`) and the 422 body sweeps by covering parameter positions they skip. A secondary block probes query-string shapes (array brackets, duplicate keys, malformed percent-encoding) that no schema describes.

## Key elements

- **`NEVER_LEGAL`** – array of hostile raw strings (NUL byte, SQL injection, path traversal, XSS, RTL override, 5 kB string, etc.) that no closed schema can accept.
- **`EDGE_VALUES`** – boundary strings (empty, `-1`, `1e999`, 25-digit number, `NaN`) that a loose schema might accept or reject; only the no-5xx guarantee applies.
- **`Target`** interface – `{ kind: 'path' | 'query', name, closed }` describing one parameter slot to attack.
- **`isClosed(node)`** – returns `true` when the resolved schema is a contract id, has an `enum`, or is typed `integer`/`number`/`boolean`.
- **`targetsOf(operation)`** – extracts all path and query parameters of an operation, annotating each with its `closed` flag.
- **`ATTACKABLE`** – filtered list of non-multipart operations that have at least one parameter; drives `describe.each`.
- **`attackedUrl(operation, url, target, value)`** – rebuilds the URL with one parameter substituted (path: segment-level replacement; query: appended as a single `name=value` pair).
- **`describe('negative fuzzing')`** – meta-test asserting the walk found > 20 operations and at least one closed target, guarding against a silent empty sweep.
- **`describe.each(ATTACKABLE)`** – per-operation property test: for each `(target, value)` pair, sends a request and asserts status < 500, response matches contract, and (if `closed && value ∈ NEVER_LEGAL`) status ≥ 400.
- **`describe('query-string shapes no schema describes')`** – fires a fixed set of adversarial query shapes (`a[$ne]=1`, `a[]=1&a[]=2`, bare `=1`, truncated percent-sequence, etc.) at every GET operation that accepts query parameters; asserts no 5xx.
- **`SEED`** – resolved from `RANDOM_DATA_SEED` env var or a random 1e9 value; logged to stdout for reproduction.

## Relationships

- **`tests/support/spec-walk.ts`** – `listOperations()` supplies the operation catalogue; `Operation`, `SchemaNode` types shape all target extraction.
- **`tests/support/spec-ids.ts`** – `isContractId()` distinguishes id-typed schemas (always closed) inside `isClosed`.
- **`tests/support/spec-arbitraries.ts`** – `bodyArbitraryFor()` generates a conforming request body so only the parameter under attack is invalid.
- **`tests/support/spec-world.ts`** – `buildUrl`, `seedWorld`, `requiredHeadersOf` provide the valid baseline URL, seeded auth context, and mandatory headers.
- **`tests/support/http.ts`** – `api()` and `authenticateAs('admin')` build and authenticate every request.
- **`tests/support/response-contract.ts`** – `assertResponseMatchesContract` validates the response envelope on every run.
- **`tests/support/knobs.ts`** – `FUZZ_RUNS_PER_OPERATION` controls the number of property-based test iterations per operation.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the database before the suite.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` (called in `afterEach`) clears any export file left by an in-flight 202.
- **`src/modules/account/services/export.ts`** – `settleInlineExports()` drains pending export jobs so teardown does not fail on a leftover file.
- **`src/infrastructure/runtime/readiness.ts`** – `markServerListening()` prevents `GET /readyz` from answering 503 (the real boot listener never fires in the test process).

## Notes

- The file mocks `@infrastructure/adapters/pdf` (no Chromium available; a missing browser is not under test). The mock is identical to the one in the valid-value fuzzer.
- `attackedUrl` for path parameters assumes a parameter name never contains `/`, so splitting the template and the valid URL on `/` yields aligned segments. A name that did contain `/` would break the index lookup silently.
- The `owed` assertion (`owed && response.status < 400`) is one-directional: a closed schema receiving a `NEVER_LEGAL` value *must* get 4xx, but an `EDGE_VALUES` entry on a closed schema may still get 200 (e.g., `0` on an unbounded integer) and that is acceptable.
- The query-shape block only targets `GET` operations; mutating verbs with hostile query shapes are not exercised here.
- Each `describe.each` case has a 120 s timeout (`120_000`), matching the valid-value fuzzer's convention for slow property-based loops.
