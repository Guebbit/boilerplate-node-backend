# docs/tools/integration-testing.md

## Purpose

Documents the integration testing layer that verifies the Express app's wiring—middleware order, route mounting, auth gates—by driving the real `src/app.ts` via supertest without a database or Redis. It exists to catch the class of bug where every unit is individually correct but the router connects them incorrectly.

## Key elements

- **`tests/integration/app-health.test.ts`** — the sole integration spec; covers `GET /`, unknown-route `404`, `GET /observability/metrics` (Prometheus format), `GET /observability/events` (SSE), and unauthenticated `401` on observability sub-paths.
- **`tests/support/http.ts` → `api()`** — shared `supertest(app)` wrapper, also consumed by the contract-testing layers.
- **`src/app.ts`** — the app under test; skips `app.listen` when `NODE_ENV === 'test'`, so importing it starts no server, Mongo, Redis, or queue.
- **`src/modules/*/tests/integration/`** — the "other half": module-level specs that call `setupTestDb()` to exercise real Mongoose behaviour (validation, defaults, indexes) without HTTP. Excluded from Stryker's mutant runs via `testPathIgnorePatterns`.
- **Command:** `npm run test:integration` → `jest tests/integration --runInBand`.

## Relationships

- **`docs/tools/unit-testing.md`** — the layer below. Integration specs are what give `service.ts` / `repository.ts` their coverage; unit coverage reports them near-zero by design. Also explains the `tsconfig.jest.json` `module: "node16"` fix that removed the old hand-assembled app workaround.
- **`docs/tools/contract-testing.md`** — uses the same `api()` harness but asserts response *shape* against `openapi.yaml` rather than wiring (status codes, headers). Routes requiring persisted data live here, not in the integration suite, to avoid duplicating `setupTestDb()` calls.
- **`docs/tools/contract-request-data.md`** — same shared harness; contract-derived request data is generated for the contract layer, not for integration.
- **`docs/reference/tests.md`** — the "Three numbers" section explains why integration specs are absent from unit-coverage runs and why mutated files show 0% in `mutation-baseline.json` (Stryker excludes integration specs, so mutants survive by construction).
- **`docs/tools/testing-and-docs.md`** — the parent overview page; integration testing is one of the suites it surveys.

## Notes

- **SSE test:** `supertest` buffers the entire response, so the `GET /observability/events` test aborts the stream after the first chunk rather than waiting for completion.
- **401 ≠ 404:** The unauthenticated observability assertions specifically verify the auth *middleware* is mounted on the path (returns `401`), not merely that the path is unreachable.
- **Deliberately thin:** One spec file. Any route that needs a database is intentionally left to the contract layers to avoid duplicating `setupTestDb()` setup under a different name.
- **No hand-assembled app:** A prior version built a private Express app from two routers + copied middleware; that was removed once the `import.meta` / subpath-export compile blocker was fixed. Testing `src/app.ts` directly cannot drift from itself.
