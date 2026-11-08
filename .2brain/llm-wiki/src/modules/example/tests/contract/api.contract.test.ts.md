---
source: src/modules/example/tests/contract/api.contract.test.ts
sha256: f0995cbdc6644c177ec4c659348c118399cea5eaa156e34fa952d4b2e982b8af
generated_at: 2026-11-08T05:54:42.206335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/examples` route over HTTP, asserting that each response declared in `openapi.yaml` is actually reachable. The file enforces one access-control invariant—cross-tenant resources return **404, never 403**, so an ID leaks no ownership information—and pins status codes, field-level validation shapes, and public-vs-private visibility. Behavioural logic lives in the integration suite; this file only verifies that the declared surface is hit.

## Key elements

- **`MALFORMED_ID`** (`'not-an-object-id'`) — a string no `ObjectId` constructor accepts; every ID-taking route must answer 404 for it.
- **`PNG_BYTES`** — a genuinely decodable PNG generated in `beforeAll` for upload-digesting tests.
- **`A_NOTE`** — minimal `{ title, body }` payload shared by cases that only need *an* example to exist.
- **`createViaApi(bearer, body)`** — creates an example through `POST /examples` so the assertion target is the app's own serialized output (not a factory seed).
- **`statusOf` / `etagOf`** — narrow Promise-unwrapping helpers that avoid destructuring the full response object.
- **`NO_ACTIONS`** — the `{ publish: false, archive: false, … }` shape a non-acting caller receives.
- **`describe('POST /examples')`** — creation: 201 + Location header, 403 for non-staff roles, 422 for missing/whitespace title.
- **`describe('GET /examples and POST /examples/search')`** — listing & search: ownership scoping, admin override, status filter + sort, closed-set validation, DTO-form search.
- **`describe('GET /examples/{id}')`** — read: ETag presence, 404-not-403 for others, public read for published, 404 for draft/archived to anonymous, `display:Example` capability, malformed & missing IDs.
- **`describe('PUT and PATCH /examples/{id}')`** — mutation cases (truncated in listing).

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — imported as a side-effect module; wires up OpenAPI response validation so every assertion is checked against `openapi.yaml`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before the suite runs.
- **`tests/support/http.ts`** — `api()` builds supertest requests; `authenticateAs` / `authenticateAsRole` mint bearer tokens for specific personas.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` runs in `afterEach` to clean up any uploaded files between tests.
- **`tests/support/ids.ts`** — `MISSING_ID` supplies a valid-format-but-nonexistent ObjectId for 404 assertions.
- **`tests/support/images.ts`** — `decodablePng()` produces the `PNG_BYTES` fixture.
- **`tests/support/account-export.ts`** — `requestAndDownloadExport` is imported (used in export-related cases further down the file).
- **`src/modules/example/tests/factories.ts`** — `createExample` seeds examples directly in the DB (bypassing the API) for setup of non-caller-owned or specific-status rows.
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions a second user to prove ownership boundaries.
- **`src/types/index.ts`** — `ExampleStatus` enum values (`draft`, `published`, `archived`) drive status-filter and visibility tests.

## Notes

- **404, not 403, for cross-tenant resources** is the single most important invariant this file guards. A module copied from this one must not reintroduce 403 assertions.
- **No bare 401/403 cases here.** Those belong to `tests/contract/authorization-contract.test.ts`, which sweeps every guarded route as every role. A contract file only adds a case when it checks *more* than the status (e.g., an error `code` field or a row left untouched).
- Use `createViaApi` when the assertion targets the **response shape** the API produces; use `createExample` (factory) when you only need a row in the DB for a *different* caller to interact with.
- `emptyFileSandbox` in `afterEach` is load-bearing: without it, uploaded PNG bytes from one test can pollute the next.
