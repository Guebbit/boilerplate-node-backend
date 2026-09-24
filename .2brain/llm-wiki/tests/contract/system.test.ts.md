---
source: tests/contract/system.test.ts
sha256: bc6a592877871f899e0b46d536145fc3d710f540c5939ad6256b8f400f455032
generated_at: 2026-09-23T19:52:40.013948+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/system.test.ts

## Purpose

Contract tests that verify the system-level routes (`GET /`) and shared error-response envelopes (404, 422) conform to their declared API specs. The file exists to catch type/shape drift between the OpenAPI-style spec and the actual wire format before it reaches production.

## Key elements

- **`setupTestDb()`** — called once at module scope to provision a throwaway database for the test run.
- **`describe('GET /')`** — asserts 200 status, `body.data.status === 'ok'`, and full spec compliance via `toSatisfyApiSpec()`.
- **`describe('error envelopes')`** — two cases:
  - 404: unmatched route returns `success: false` and an `errors` array.
  - 422: invalid login payload is validated against the spec with `toSatisfyApiSpec()`.
- **`api()`** — thin HTTP client used to issue requests without a running server.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — imported as a side-effect module; provides the `toSatisfyApiSpec()` Jasmine matcher and the shared envelope/health-ping spec definitions that the assertions rely on.
- **`tests/support/http.ts`** (`@tests/http`) — exports the `api` helper that builds in-process request objects and returns `{ status, body }` for assertions.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — exports `setupTestDb`, which configures an ephemeral test database so the 422 validation path (which touches the DB layer) can execute without external services.

## Notes

- The file's doc comment records a past bug: `GET /` was typed as `MessageResponse` while actually returning a health-ping shape. It is now `HealthPingEnvelope`; if you see a type mismatch in this area, check that the spec import in `contract.ts` still references the correct envelope.
- `setupTestDb()` is called unconditionally at module load (not inside a `beforeAll`), so any test in this file that doesn't need a DB still pays the setup cost. This is intentional for import-order simplicity.
- Only the 422 case calls `toSatisfyApiSpec()`; the 404 case manually asserts the three envelope fields. This is a deliberate lighter-touch check because the 404 envelope shape is simpler.
