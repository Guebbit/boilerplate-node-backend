---
source: src/modules/example/tests/contract/api.contract.test.ts
sha256: d0815e741b4fd3ea8116347b04a6533013ea0c48dd8ae9b077adb8add7e27cc1
generated_at: 2026-11-14T20:00:40.201002+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/examples` API surface. Each case exercises a route over real HTTP (via supertest) and asserts the declared response is actually reached: correct status, `Location`/`ETag` headers, field-level error shape, and response body structure. Behavioural rules (row state, side-effects) are the integration suite's job; this file exists to pin the HTTP contract to `openapi.yaml`.

## Key elements

- **`MALFORMED_ID`** — a string that cannot be parsed as an ObjectId; used to assert every id-taking route treats it as "unknown id."
- **`A_NOTE`** — a minimal `{ title, body }` payload reused by cases that only need *an* example.
- **`createViaApi(bearer, body)`** — creates an example through `POST /examples` so the payload under test is the app's own output, not a factory shape.
- **`statusOf(request)`** / **`etagOf(request)`** — thin promise-unwrap helpers for asserting on a single response field without destructuring the whole supertest response.
- **`NO_ACTIONS`** — the all-`false` actions object; asserted when a signed-in user has no permission on a resource.
- **Test suites** — `POST /examples`, `GET /examples` + `POST /examples/search`, `GET /examples/{id}`, `PUT`/`PATCH /examples/{id}` (truncated), and likely further mutation routes.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` (`@tests/contract`) | Side-effect import; bootstraps contract-test infrastructure (likely OpenAPI schema validation middleware). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/test database for the suite. |
| `tests/support/http.ts` | Provides `api()`, `authenticateAs()`, `authenticateAsRole()` — the HTTP client and auth helpers every case uses. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` runs in `afterEach` to clean up any uploaded files. |
| `tests/support/ids.ts` | `MISSING_ID` is a canonical "no such record" id used in 404 assertions. |
| `tests/support/images.ts` | `decodablePng()` generates a real PNG buffer (loaded in `beforeAll`) for upload-route tests. |
| `tests/support/account-export.ts` | `requestAndDownloadExport` is imported for export-endpoint cases (visible in the truncated portion). |
| `src/modules/example/tests/factories.ts` | `createExample` seeds DB rows directly when the test only needs a record to exist, not the app's response shape. |
| `src/modules/users/tests/factories.ts` | `createUser` creates additional users (owner, other) for ownership/permission scenarios. |
| `src/types/index.ts` | `ExampleStatus` enum values (`draft`, `published`, `archived`) used in factory seeds and query filters. |

## Notes

- **Deliberate omissions:** No bare 401, 403, or malformed-id assertions live here. Those are covered by `tests/contract/authorization-contract.test.ts` (every guarded route × every role) and `tests/integration/malformed-ids.test.ts` (every id position × every malformed spelling). A case belongs in this file only if it checks *more* than the status code (an error `code`, a row left untouched).
- **404 ≠ 403 convention:** Accessing another user's example returns **404**, never 403, so the id does not leak ownership. Tests assert this explicitly.
- **`createViaApi` vs. `createExample`:** Use the API helper when the test asserts on the response shape the app produces; use the factory when the test only needs a row in the DB.
- **Module-copy warning (from the docblock):** If this pattern is copied to another module, do **not** re-introduce the omitted 401/403/malformed-id cases — they remain the responsibility of the dedicated sweep suites.
