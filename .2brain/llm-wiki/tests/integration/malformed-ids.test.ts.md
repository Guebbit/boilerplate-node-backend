---
source: tests/integration/malformed-ids.test.ts
sha256: 25930a942090d69fb714722dfc212f232c0bc755f6ce472fc00235614407343f
generated_at: 2026-11-08T09:42:50.989256+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/malformed-ids.test.ts

## Purpose

Spec-driven integration test enforcing one rule: an ID that satisfies the OpenAPI `Id` schema but was never issued by this backend gets a deterministic, position-specific answer (path → 404 identical to an unknown ID; body or query → 422 `VALIDATION_ERROR` naming the field). Sites are discovered at runtime from `openapi.yaml` via the shared `Id` schema, so any new route is covered on its first run without editing this file.

## Key elements

- **`MALFORMED` / `BAD_ID`** – Fixed array of spec-valid but backend-unknown ID values; `BAD_ID` is the first, reused for body/query sites.
- **`PATH_SITES` / `BODY_SITES` / `QUERY_SITES`** – Flat `(label, operation, parameter-or-segments)` tuples derived from the spec. `BODY_SITES` excludes multipart operations.
- **`validBodyFor`** – Produces one spec-valid JSON body (or `undefined`) via `fc.sample` on `bodyArbitraryFor`.
- **`send`** – Dispatches a single request with the operation's method, auth, and required headers; reduces the response to `{ status, body }`.
- **`fillParameter`** – Builds the URL with all world-seeded parameters filled except one, which is replaced by a test-supplied value (using `SENTINEL` as a placeholder).
- **`documentedStatuses`** – Reads the response-code keys from the spec for an operation; used to assert the spec documents the expected status.
- **`jest.mock('@infrastructure/adapters/pdf')`** – Replaces PDF rendering with a stub so no browser is needed.
- **Meta-test ("are found, so the sweeps below cannot pass by sweeping nothing")** – Asserts minimum site counts (≥ 71 path, ≥ 19 body, ≥ 8 query) to catch a silent regression in the spec walker.
- **Three `describe.each` blocks** – One per position (path, body, query), each with a "documents the status" check and a behavioral check.

## Relationships

- **`tests/support/spec-walk.ts`** – `listOperations`, `readSpec`, `Operation`, `SchemaNode` supply the operation inventory and spec nodes this file iterates over.
- **`tests/support/spec-ids.ts`** – `idPathParameters`, `idBodyFields`, `idQueryFields`, `setPath`, `fieldName`, `Segment` identify which parameters/fields are IDs and how to address them.
- **`tests/support/spec-world.ts`** – `seedWorld`, `buildUrl`, `requiredHeadersOf`, `OBJECT_ID`, `World` provide the seeded rows, URL construction, and a known-valid ID used as the "unknown" baseline.
- **`tests/support/http.ts`** – `api`, `authenticateAs` perform the actual HTTP calls and produce bearer tokens.
- **`tests/support/shopper-routes.ts`** – `roleReaching` maps each operation to the role (admin or customer) that should authenticate, so shopping-route tests get a customer basket.
- **`tests/support/spec-arbitraries.ts`** – `bodyArbitraryFor` generates a valid request body from the operation's schema.
- **`tests/support/problem.ts`** – `withoutInstance` strips the instance identifier from problem-detail bodies before deep-equal comparison.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` configures the test database lifecycle.

## Notes

- **Path-position ordering is asserted, not assumed.** The test compares the malformed-ID 404 body against the unknown-ID 404 body (minus instance) *only* when the unknown answer is itself 404. If a body-level validation error (422/409) fires before the ID check, the two responses diverge in status and the test fails — this is the deliberate guard that ID validation must precede body parsing.
- **Shopping routes are the auth exception.** The suite comment notes they are sent as a customer (not admin) because the basket the suite builds belongs to that customer; `roleReaching` handles this mapping.
- **Per-test timeout is 60 s** to accommodate DB seeding and multiple sequential requests within a single test.
- **`BODY_SITES` skips multipart operations** because `setPath` mutates a plain JSON object, which does not model a multipart boundary.
- **The meta-test uses `toBeGreaterThanOrEqual`** rather than an exact count, so adding a route is safe but removing recognition of `Id` from the walker is caught.
