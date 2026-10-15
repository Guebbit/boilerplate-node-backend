---
source: tests/integration/malformed-ids.test.ts
sha256: 1f9c7efbfc25702e689571294b60a83fd2d5a3414c71a8518e326c2a265306b1
generated_at: 2026-10-15T12:48:36.717536+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/malformed-ids.test.ts

## Purpose

Spec-driven integration test that enforces the "malformed ID" contract rule on **every** route the OpenAPI spec declares: a path-segment ID not issued by this backend must return the identical 404 as an unknown ID, while a body or query ID in the same situation must return 422 `VALIDATION_ERROR` naming the offending field. The site list is derived from `openapi.yaml` at runtime, so a route added later is covered on its first run without any manual update here.

## Key elements

- **`MALFORMED`** – Array of values that satisfy the spec's `Id` schema (e.g. 24-char hex, 63-char strings) but were never issued by this backend; used as test inputs.
- **`BAD_ID`** – First element of `MALFORMED`; sufficient single value for body/query assertions.
- **`PATH_SITES` / `BODY_SITES` / `QUERY_SITES`** – Flat-mapped arrays of `(label, operation, parameter | segments)` tuples, one per declared ID site. Discovered via `spec-ids.ts` helpers over `listOperations()`.
- **`validBodyFor(schema)`** – Samples a single spec-valid JSON body with `fast-check` (`fc.sample`, fixed seed 7).
- **`send(operation, url, bearer, body)`** – Issues an authenticated HTTP request (via `api()` from `@tests/http`) and reduces the response to `{ status, body }`.
- **`fillParameter(operation, world, parameter, value)`** – Builds a URL with exactly one path parameter overridden; uses a `SENTINEL` placeholder to exclude the target from `buildUrl`'s world-based filling.
- **`documentedStatuses(operation)`** – Reads the OpenAPI spec to confirm the operation's documented response codes include the expected 404/422.
- **Guard test** – Asserts minimum site counts (≥ 71 path, ≥ 19 body, ≥ 8 query) so a regression in spec-walk that silently loses ID recognition cannot let the sweeps pass vacuously.
- **`jest.mock('@infrastructure/adapters/pdf')`** – Stubs `renderHtmlToPdf` to return a dummy buffer, avoiding a real browser dependency on the invoice route.
- **`setupTestDb()`** – Initialises the test database fixture before any test runs.

## Relationships

- **`tests/support/spec-ids.ts`** – Core dependency: provides `idPathParameters`, `idBodyFields`, `idQueryFields`, `fieldName`, `setPath`, and the `Segment` type that drive site discovery and body mutation.
- **`tests/support/spec-walk.ts`** – Provides `listOperations`, `readSpec`, and the `Operation` / `SchemaNode` types used to enumerate and describe every operation.
- **`tests/support/spec-world.ts`** – Provides `seedWorld` (creates realistic DB rows per user), `buildUrl` (fills path params from the world), `requiredHeadersOf`, `OBJECT_ID`, and the `World` type.
- **`tests/support/http.ts`** – Provides the `api()` HTTP client and `authenticateAs` for obtaining bearer tokens.
- **`tests/support/shopper-routes.ts`** – Provides `roleReaching(operation)` to pick the correct auth role (admin by default; customer for shopping routes where an admin holds no basket key).
- **`tests/support/spec-arbitraries.ts`** – Provides `bodyArbitraryFor` to generate spec-conformant request bodies for arbitrary operations.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb` to initialise the in-memory/test database.

## Notes

- **Auth is admin by default.** The rationale (stated in the file header) is that a malformed-ID refusal is the controller's own validation, not a permission gate. The sole exception is shopping routes, where `roleReaching` switches to a customer role because an admin has no basket key.
- **Rejection order matters.** The path-ID test explicitly checks that the 404 body is *identical* to the unknown-ID body, even when the request body would otherwise be invalid (422/409). This enforces that malformed-ID rejection precedes body validation.
- **`fillParameter` sentinel trick.** `buildUrl` fills *all* path params from the world. To override a single param, the target is temporarily replaced with `SENTINEL`, removed from `pathParameters`, then restored after `buildUrl` returns.
- **Minimum counts are intentionally > 1.** A spec-walk regression that still recognises *some* `Id` fields would pass a `≥ 1` check; the thresholds (71/19/8) catch partial regressions.
- **Timeouts are 60 s per test** (set via the third argument to `it`) because each case seeds a fresh world and may hit multiple HTTP round-trips (one unknown + five malformed values for path sites).
