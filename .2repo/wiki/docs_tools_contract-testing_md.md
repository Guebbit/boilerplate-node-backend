# docs/tools/contract-testing.md

## Purpose

Documents the response-shape contract testing layer: validates that serialized JSON from real HTTP responses matches `openapi.yaml` exactly (including the absence of undeclared fields like `password` or `_id`). Complements the request-shape layer in `contract-request-data.md`.

## Key elements

- **Tools table** — `jest-openapi` (adds `toSatisfyApiSpec()`) and `supertest` (HTTP harness).
- **"Why not Zod" section** — explains why `api/schemas.zod.ts` cannot replace `jest-openapi` for response validation (non-strict generated schemas strip unknown keys; backend never validates responses with Zod at all).
- **Architecture diagram (Mermaid)** — flow from `openapi.yaml` through `jest-openapi` to the assertion.
- **Patterns** — three recurring shapes: role-branch tests, credential-leak guards (`assertNoCredentials()` + `toSatisfyApiSpec()`), and error-shape (4xx) assertions.
- **File map** — co-located per-module `api.contract.test.ts` files under `src/modules/<name>/tests/contract/`, plus central files (`system.test.ts`, `request-sources.test.ts`).
- **Commands** — `npm run test:contract` runs all contract suites with `--runInBand`.

## Relationships

- **`tests/support/contract.ts`** — the actual file that registers `jest-openapi` against `openapi.yaml` and hosts the "why not Zod" header comment this page references.
- **`tests/support/http.ts`** — provides the `api()` and `authenticateAs()` helpers used in every contract test; shared with integration testing.
- **`api/schemas.zod.ts`** — the generated Zod schemas this page explicitly distinguishes from the contract-testing path (non-strict, used for request bodies, not response validation).
- **`docs/tools/contract-request-data.md`** — the request-shape half of contract testing; cross-referenced as a structurally different layer.
- **`docs/index.md`** — parent/overview page; this page is linked from it under the testing tools section.

## Notes

- Orval *can* emit `zod.strictObject` via `override.zod.strict`; the frontend repo enables this for its own response validation, but the backend intentionally does not — the gap is a config choice, not a hard tool limitation.
- Contract suites are co-located with their module and deleted with it; only domain-agnostic specs (`/`, route-completeness checks) live under `tests/contract/`.
- The explicit `assertNoCredentials()` helper in the `users` suite is intentionally redundant with `toSatisfyApiSpec()` (which catches any undeclared field via `additionalProperties: false`); it exists as a readable statement of intent, not as the sole guard.
