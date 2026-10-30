---
source: src/modules/example/tests/contract/api.contract.test.ts
sha256: f0995cbdc6644c177ec4c659348c118399cea5eaa156e34fa952d4b2e982b8af
generated_at: 2026-10-29T03:56:59.319790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/examples` routes, verifying that each HTTP response shape actually matches what `openapi.yaml` declares. Where the integration suite asserts behavioural rules, this file confirms that every *declared* response (status, headers, body shape) is reachable over real HTTP. It also encodes the cross-tenant convention: a non-owner requesting another user's example receives **404**, never **403**, so an id leaks nothing about ownership.

## Key elements

- **`MALFORMED_ID`** – A string (`'not-an-object-id'`) that cannot be parsed as an ObjectId; every id-taking route must answer it as an unknown id (404), indistinguishable from a valid-but-absent id.
- **`PNG_BYTES`** – Decoded in `beforeAll` via `decodablePng()`; used for inline image-upload digests when no broker is present.
- **`A_NOTE`** – Minimal valid `{ title, body }` payload for cases that only need *an* example to exist.
- **`createViaApi(bearer, body)`** – Creates an example through the live `POST /examples` endpoint so the payload under test is exactly what the app produces (as opposed to a factory-inserted row).
- **`statusOf(request)`** – Awaits a supertest request and returns only the numeric status.
- **`etagOf(request)`** – Awaits a supertest request and returns the `ETag` header.
- **`NO_ACTIONS`** – The zero-permission action object (`publish/archived/unarchive/update/delete` all `false`), asserted for strangers viewing a published example.
- **`describe` blocks** – One per route: `POST /examples`, `GET /examples` + `POST /examples/search`, `GET /examples/{id}`, `PUT`/`PATCH /examples/{id}` (truncated), and (presumably) delete/upload routes further down.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`); registers the OpenAPI spec so responses are validated against it. |
| `tests/support/http.ts` | Provides `api()` (supertest instance), `authenticateAs`, `authenticateAsRole` for building authenticated requests. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database before the suite runs. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` runs in `afterEach` to isolate filesystem state between cases. |
| `tests/support/ids.ts` | `MISSING_ID` constant used for "id nothing holds" 404 cases. |
| `tests/support/images.ts` | `decodablePng()` supplies a valid PNG buffer for upload-related cases. |
| `tests/support/account-export.ts` | `requestAndDownloadExport` (imported; used in the truncated export/delete section). |
| `src/modules/example/tests/factories.ts` | `createExample` factory seeds example rows directly in the DB (owner assignment, status). |
| `src/modules/users/tests/factories.ts` | `createUser` factory creates secondary users for cross-tenant / multi-actor scenarios. |
| `src/types/index.ts` | `ExampleStatus` enum (`draft`, `published`, `archived`) drives status-filtering and visibility cases. |

## Notes

- **No bare 401/403 assertions here.** The module doc-block explicitly states that the authorization sweep lives in `tests/contract/authorization-contract.test.ts`, which probes every guarded route for both codes across every role. A module copied from this one must *not* re-add them.
- **`@tests/contract` is a side-effect import.** It has no named export used in this file; its purpose is to wire the OpenAPI spec into the test runner.
- **`createViaApi` vs. `createExample`.** The former goes through the HTTP API (verifying the 201 contract on the way in); the latter inserts a DB row directly. Use the former when the test's precondition is "the app created it," the latter when the only thing that matters is the resulting state (owner, status).
- **404-over-403 is a deliberate, documented choice**, not an oversight. Tests for anonymous access to draft/archived examples assert 404 "exactly as for one that does not exist," reinforcing that an id is not a capability token.
