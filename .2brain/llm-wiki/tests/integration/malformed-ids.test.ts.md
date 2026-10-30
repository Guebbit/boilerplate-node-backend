---
source: tests/integration/malformed-ids.test.ts
sha256: d585c1932880b216a234d36e229d96b180739db2ef8ca812ae5abfba4c2952c1
generated_at: 2026-10-29T06:59:13.562107+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/malformed-ids.test.ts

## Purpose

Property-based integration suite that enforces the rule *"a malformed id has one answer per position, on every route the spec declares."* For every operation in `openapi.yaml` that carries an `Id` in a path parameter, body field, or query field, it asserts the correct, spec-documented response: a **404** (indistinguishable from an unknown id) for path sites, and a **422 `VALIDATION_ERROR`** naming the field for body/query sites. Because the sites are derived from the spec rather than hardcoded, any route added later is held to the rule on its first run.

## Key elements

- **`MALFORMED`** – Five values that the spec's `Id` schema accepts syntactically but this backend never issued (short hex, dashes, wrong-length runs, etc.).
- **`PATH_SITES` / `BODY_SITES` / `QUERY_SITES`** – Arrays of `(operation, field)` tuples built by walking the spec via `spec-ids.ts`. Multipart operations are excluded from body sites.
- **`send(operation, url, bearer, body)`** – Authenticated Supertest call; returns a reduced `{ status, body }` tuple.
- **`fillParameter(operation, world, parameter, value)`** – Builds a URL via `buildUrl` while replacing one path parameter with a sentinel, then swaps in the test value.
- **`validBodyFor(schema)`** – Samples one spec-valid body with `fast-check` (fixed seed 7) so the request is otherwise well-formed.
- **`documentedStatuses(operation)`** – Reads the response keys from `openapi.yaml` to assert the expected status is declared.
- **Guard test** (`are found, so the sweeps below cannot pass by sweeping nothing`) – Asserts minimum site counts (≥ 71 path, ≥ 19 body, ≥ 8 query) so a silent spec-walking regression can't shrink the suite to zero.
- **`describe.each` blocks** – One sub-suite per site; each asserts (1) the status is documented, and (2) the response matches the rule. Timeout: 60 s per case.
- **`jest.mock` of `@infrastructure/adapters/pdf`** – Prevents the invoice route from needing a real browser.

## Relationships

- **`tests/support/spec-walk.ts`** – `listOperations` and `readSpec` enumerate the operations and let the guard test read documented statuses.
- **`tests/support/spec-ids.ts`** – `idPathParameters`, `idBodyFields`, `idQueryFields`, `fieldName`, `setPath` locate every `Id` site and set/names the field under test.
- **`tests/support/spec-world.ts`** – `seedWorld`, `buildUrl`, `requiredHeadersOf`, `OBJECT_ID` supply seeded rows and a valid base URL for each request.
- **`tests/support/spec-arbitraries.ts`** – `bodyArbitraryFor` generates a spec-conformant body so the malformed id is the only fault.
- **`tests/support/shopper-routes.ts`** – `roleReaching` selects the auth role that can legitimately reach each operation (admin by default; shopping routes are the exception).
- **`tests/support/http.ts`** – `api` (Supertest agent) and `authenticateAs` (bearer-token acquisition) drive every HTTP call.
- **`tests/support/problem.ts`** – `withoutInstance` strips volatile fields so the 404-body comparison is stable.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory database before any test runs.

## Notes

- The suite is **spec-driven, not route-driven**: it never lists endpoints. Coverage grows automatically when `openapi.yaml` gains a new `Id` reference, and a controller that forgets its check will surface as an unexpected 422/500 here instead of a 404.
- All calls are made **as admin**, so a refusal is the controller's own logic, not a permission gate. Shopping routes are the one exception because an admin holds no basket key.
- `fast-check` is used only for *sampling* one valid body (`fc.sample`, seed 7); the suite is not a full property-based search.
- The guard-test counts (71 / 19 / 8) are floors, not exact targets; they exist to catch a spec-walker that silently stops recognising the `Id` schema while still finding a handful of sites.
- Each `describe.each` case carries a 60-second timeout because it performs DB seeding plus one or more HTTP round-trips per malformed value.
