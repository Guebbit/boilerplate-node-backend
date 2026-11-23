---
source: src/modules/example/tests/contract/api.contract.test.ts
source_sha256: d0815e741b4fd3ea8116347b04a6533013ea0c48dd8ae9b077adb8add7e27cc1
context_sha256: 2c38c2d7dd1814baadb940505bc79ed76505f397235a2b8af9292e3f4e85130c
generated_at: 2026-11-22T05:13:32.327308+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/examples` routes. Every route is exercised over HTTP and judged against `openapi.yaml` (via the `@tests/contract` import), so each declared response is actually reached. It covers one open read (a published example is readable by anyone). The remaining routes require sign-in and are narrowed by who is asking. Someone else's example is a 404, never a 403. Behavioural rules belong to the integration suite.

## Key elements
- `setupTestDb()`: sets up the test database for the suite.
- `beforeAll` / `afterEach`: `beforeAll` builds `PNG_BYTES` with `decodablePng()` (for uploads, which are digested inline when there is no broker). `afterEach` runs `emptyFileSandbox`.
- `MALFORMED_ID`: an id no ObjectId can be built from.
- `A_NOTE`: the default `{ title, body }` payload.
- `createViaApi(bearer, body)`: creates an example through `POST /examples` as the caller. It throws a descriptive error if the status is not 201, and returns `{ id }`.
- `statusOf(request)` / `etagOf(request)`: small helpers that await a supertest request and return its status or `ETag` header.
- `NO_ACTIONS`: the `actions` object with every flag `false`. It is what a caller who may do nothing to an example sees.
- `describe` blocks visible here:
  - `POST /examples`: creates a draft owned by the caller and checks the `location` header points at the new example. The `user` and `unverified` personas get 403, and `manager` can create. An invalid body gets 422, including a whitespace-only title, which returns a field-level error with `details: { field: 'title' }`.
  - `GET /examples and POST /examples/search`: lists the caller's own examples with pagination meta. Administrators see everyone's. Filtering by `status` and sorting work. An unknown status gets 422. The search DTO form matches by `text`.
  - `GET /examples/{id}`: covers the owner's read with an `ETag`, 404 for another user's example, and anonymous reads of published examples. Anonymous callers get 404 for draft and archived ones. A signed-in stranger sees a published example with `NO_ACTIONS`. The owner can read their own archived example. An admin can read anyone's draft. A missing id gets 404.
  - `PUT and PATCH /examples/{id}`: begins with a "replaces the representation" case.

## Relationships
- `../factories` (`createExample`) and `@modules/users/tests/factories` (`createUser`): seed examples and other users directly in the database.
- `@types` (`src/types/index.ts`): supplies `ExampleStatus`, with `draft`, `published` and `archived` used here.
- `tests/support/http.ts`: provides `api`, `authenticateAs` and `authenticateAsRole`.
- `tests/support/contract.ts`: imported for its side effect of checking responses against the OpenAPI spec.
- `tests/support/setup-test-db.ts`, `file-sandbox.ts`, `ids.ts` (`MISSING_ID`) and `images.ts` (`decodablePng`): provide the test DB, file cleanup, a nonexistent id and a decodable PNG.
- `tests/support/account-export.ts`: provides `requestAndDownloadExport`. It is imported, but not used in the visible portion.

## Notes
- By design, there are no bare 401, 403 or malformed-id cases here. They are covered by `tests/contract/authorization-contract.test.ts` and `tests/integration/malformed-ids.test.ts`. A contract case belongs here only if it checks more than the status, such as an error `code` or a row left untouched. A module copied from this one should not add those cases back.
- Not-owner and not-visible cases return 404 so an id reveals nothing about ownership.
- Authoring is staff-only: roles `editor`, `manager` and `admin` can create, while `user` and `unverified` get 403.
