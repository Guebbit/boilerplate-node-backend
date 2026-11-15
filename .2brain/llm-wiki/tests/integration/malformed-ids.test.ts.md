---
source: tests/integration/malformed-ids.test.ts
sha256: fa0522f706fc6fea5c45f760141bb8a7bfa47cba25dd50cfd8d7ad380ad7a0bf
generated_at: 2026-11-14T23:18:02.192743+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/malformed-ids.test.ts

## Purpose

Property-driven integration test that verifies a single contract rule across every ID site the OpenAPI spec declares: a malformed ID (valid per the `Id` schema but never issued by this backend) must receive the **same** 404 as an unknown ID when in a URL path, or a 422 `VALIDATION_ERROR` naming the field when in a body or query. Rather than listing routes by hand, it enumerates sites from `openapi.yaml` at runtime, so a new route is covered on its first run.

## Key elements

- **`MALFORMED`** — five string values the `Id` contract accepts but this backend never issues (wrong length, wrong charset, etc.).
- **`PATH_SITES` / `BODY_SITES` / `QUERY_SITES`** — flat arrays of `(label, operation, parameter|segments)` tuples derived from the spec via `spec-ids` helpers.
- **`validBodyFor(schema)`** — samples one spec-valid JSON body with `fast-check` (seed 7) for write operations.
- **`send(operation, url, bearer, body)`** — issues the request as admin and reduces the response to `{ status, body }`.
- **`fillParameter(operation, world, parameter, value)`** — builds the URL via `buildUrl` but substitutes one path parameter with a malformed value.
- **`echoing(body, value)`** — deep-clones a response body and swaps `OBJECT_ID` for the malformed value, permitting the one allowed difference (echoed ID in copy).
- **`BODY_THAT_REACHES_THE_404`** — hand-written bodies for the two translation routes whose random body would be 422'd before the ID lookup, preventing a false comparison.
- **`COMPARED` / `MUST_COMPARE`** — canary set ensuring the translations `{id}` rows actually completed their comparison and were not silently skipped.
- **Three `describe` blocks** — one each for path, body, and query ID sites; each asserts the documented status code, the correct status, and (for paths) body equivalence modulo the echoed ID.
- **`jest.mock('@infrastructure/adapters/pdf', …)`** — stubs PDF rendering so the invoice route doesn't require a browser.

## Relationships

- **`tests/support/spec-ids.ts`** — source of `idPathParameters`, `idBodyFields`, `idQueryFields`, `fieldName`, `setPath`; the enumeration logic that turns the spec into test sites.
- **`tests/support/spec-walk.ts`** — provides `listOperations`, `readSpec`, and the `Operation`/`SchemaNode` types used throughout.
- **`tests/support/spec-world.ts`** — `seedWorld` creates the DB rows other parameters reference; `buildUrl` fills remaining path params; `requiredHeadersOf` supplies extra headers; `OBJECT_ID` is the known-valid ID used as the "unknown" baseline.
- **`tests/support/http.ts`** — `api` (request client) and `authenticateAs` (token acquisition) for every request the suite sends.
- **`tests/support/shopper-routes.ts`** — `roleReaching` determines whether a route is reached as admin or as a customer (the one exception noted in the file header).
- **`tests/support/spec-arbitraries.ts`** — `bodyArbitraryFor` generates a spec-valid request body for the operation under test.
- **`tests/support/problem.ts`** — `withoutInstance` strips the instance-specific URL so body comparisons ignore it.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory DB before any test runs.

## Notes

- **Spec-driven, not route-driven.** The site lists are computed at import time from `openapi.yaml`; there is no manual route list to keep in sync. The first test asserts minimum counts (≥ 71 path, ≥ 19 body, ≥ 8 query) so a silent regression in `spec-ids` or `spec-walk` fails loudly.
- **The `echoing` allowance.** The rule says a malformed ID gets the *same* 404 as an unknown one, but some error copy embeds the ID it received. The test permits exactly that substitution and nothing else.
- **`BODY_THAT_REACHES_THE_404` canary.** If a new route's random body is rejected before the ID lookup, the "unknown" probe won't return 404 and the comparison is skipped. The `MUST_COMPARE`/`COMPARED` pair guards against the translations rows being the ones skipped.
- **60 s timeout per test** — each path-site test sends 1 (unknown) + 5 (malformed) requests; the timeout is generous for CI.
- **The PDF mock** is a module-level `jest.mock` that resolves to a 3-byte buffer; it exists only because the invoice-with-order path would otherwise try to render HTML to PDF.
