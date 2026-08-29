# docs/tools/contract-request-data.md

## Purpose

Documents the request-side contract-testing tooling: a zod v4 schema-AST walker (`tests/support/contract-data.ts`) that generates valid and invalid payloads directly from the schema definitions in `api/schemas.zod.ts`. It exists to verify that every write endpoint accepts all contractually legal inputs and rejects all contractually illegal ones—something hand-written factories can't do because they encode a single known scenario rather than "any legal input."

## Key elements

- **`validPayload(schema)`** – Walks a zod `_zod.def` AST recursively; returns a payload with every field populated to a value satisfying that field's own checks (lengths, formats, min/max). Optional and defaulted fields are included.
- **`invalidPayloads(schema)`** – Builds one valid base payload, then produces one case per violable constraint: missing required field, string too short/long, wrong format (email/url), number out of range, array below min length, or a wrong-typed fallback.
- **`createRandom(seed)` (Mulberry32 PRNG)** – ~10-line deterministic seeded generator; chosen over `@faker-js/faker` because faker v10 is ESM-only and incompatible with the project's `ts-jest` / `module: "node16"` setup.
- **`RANDOM_DATA_SEED`** – Process-level env var; printed to console on first generation call so a failing run is reproducible via re-run. Deliberately generic (not backend-specific) so any repo reading the same variable gets the same stream.
- **Endpoint-specific glue (in the test file)** – Patches cross-field rules (e.g. `passwordConfirm = password`) and referential ids (`userId`, `productId`) that the schema cannot express, skipping the patch for the field under test.

## Relationships

- **`tests/support/contract-data.ts`** – The implementation file; this page is its documentation.
- **`tests/contract/request-contract.test.ts`** – Consumes `validPayload`/`invalidPayloads`, adds endpoint-specific patches, and asserts 2xx/422 against live endpoints.
- **`api/schemas.zod.ts`** – Source of the zod schemas the walker traverses (e.g. `CreateProductBody`, `CreateUserBody`).
- **`docs/tools/contract-testing.md`** – The response-side mirror; shares the Jest + `jest-openapi` runner and the `RANDOM_DATA_SEED` vocabulary, but uses orval factories instead of this walker.
- **`src/modules/users/model.ts` / `src/modules/products/model.ts`** – Extend the base schemas with hand-written validation rules; the drift between these and `openapi.yaml` is what the tests surface as "findings."
- **`docs/index.md`** – Wiki index; links to this page.

## Notes

- **Numbers are always integers.** A deliberate choice: `openapi.yaml` declares `type: integer` while zod may only say `z.number().min(1)`. An integer satisfies both; a float would not satisfy the spec.
- **`default:` fields were once misclassified as required.** The walker's `isOptionalField` originally checked only for type `'optional'`; a zod `.default(…)` node has type `'default'`. The check now accepts both. If you extend the walker for new node types, remember to audit this path.
- **Findings are left as findings.** Spec/validator drift (tighter or laxer than `openapi.yaml`) is documented in the page's table but *not* fixed by the test. Closing a gap is an endpoint-owner decision, not a test-side concern.
- **PRNG streams are intentionally independent.** This file's Mulberry32 and the response-side generator (faker/Mersenne Twister) produce unrelated values from the same seed. That is correct by design—they model opposite halves of the contract from different schema surfaces.
- **`_zod.def` is a public, typed introspection surface** (see `node_modules/zod/v4/core/schemas.d.ts`), not a private-internal hack. The ~150-line in-repo walker was chosen over `zod-fixture` / `@anatine/zod-mock` to avoid zod-major version-lag risk.
