---
source: src/modules/example/tests/contract/api.contract.test.ts
sha256: 44c4a2c010fb621fdc38cea5b0b6a6de9155d1227140a413a47500441e788fd5
generated_at: 2026-10-14T15:46:44.193334+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/examples` API surface. Every route is exercised over HTTP and its response status is checked against the declarations in `openapi.yaml`. The goal is to guarantee each declared status code (200, 201, 401, 403, 404, 422) is actually reachable; behavioural and business-logic assertions live in the separate integration suite.

## Key elements

- **`MALFORMED_ID`** – a string (`'not-an-object-id'`) that cannot be parsed as an ObjectId; used to verify id-validation routes return 404, not a 500.
- **`PNG_BYTES`** – a 4×4 PNG buffer generated in `beforeAll` via `sharp`; used by upload-related tests that digest a file inline (no broker).
- **`A_NOTE`** – a minimal valid `{ title, body }` payload reused as the default creation body.
- **`createViaApi(bearer, body)`** – posts to `/examples` and returns the created `id`; ensures the payload under test is whatever the API itself produces.
- **`statusOf(request)`** / **`etagOf(request)`** – thin helpers that await a supertest promise and return only the status code or ETag header, keeping assertions one-liners.
- **`authenticateWithoutRole()`** – creates a user with no `examples.*` permission key via `createUser`, then logs in; used to assert 403 responses.
- **`describe` blocks** – one per route group: `GET /examples/published/{id}`, `POST /examples`, `GET /examples` + `POST /examples/search`, `GET /examples/{id}`, `PUT/PATCH /examples/{id}`, and (truncated) likely `DELETE` and upload routes.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as a side-effect (`'@tests/contract'`); likely registers the OpenAPI spec validator that the suite asserts against. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top-level to prepare/tear down the database. |
| `tests/support/http.ts` | Provides `api()` (supertest agent), `authenticateAs`, and `loginBearer` used throughout. |
| `tests/support/ids.ts` | Provides `MISSING_ID`, a well-formed but non-existent ObjectId. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` runs in `afterEach` to isolate filesystem state. |
| `tests/support/account-export.ts` | Provides `requestAndDownloadExport` for export-related tests (beyond the truncated portion). |
| `src/modules/example/tests/factories.ts` | Provides `createExample` to seed examples with specific owners/statuses. |
| `src/modules/users/tests/factories.ts` | Provides `createUser` for multi-user and no-role scenarios. |
| `src/types/index.ts` | Provides the `ExampleStatus` enum (draft, published, archived) used in test data. |

## Notes

- **404 vs 403 convention:** Accessing another user's example by ID always yields **404**, never 403, so a valid ID does not reveal ownership. This is asserted explicitly in several `it` blocks and called out in the module docblock.
- **`MALFORMED_ID` vs `MISSING_ID`:** The former tests input-shape validation (unparseable); the latter tests lookup against a valid-but-absent key. Both must return 404.
- **Contract vs integration:** This file only verifies that each OpenAPI-declared status is reachable. It does not assert response-body semantics, pagination math, or side-effects—those belong to the integration suite.
- **`afterEach(emptyFileSandbox)`** guarantees no file residue leaks between tests, which matters for upload/digest paths.
