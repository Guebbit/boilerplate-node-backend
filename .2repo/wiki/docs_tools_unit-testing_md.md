# docs/tools/unit-testing.md

## Purpose

Documents the unit-testing layer: what it covers (services, repositories, models, middlewares, adapters), the tooling (Jest + ts-jest), its structural boundaries against integration and contract testing, and the conventions that keep it database-free and HTTP-free. It also records the `tsconfig.jest.json` deviations and the commands to run the suite.

## Key elements

- **Jest + ts-jest** — test runner and TypeScript transform; configured via `jest.config.js` and `tsconfig.jest.json`.
- **`jest.mock()`** — used selectively at the import boundary to replace adapters (filesystem, mailer, cache) while leaving the unit under test running for real.
- **`tsconfig.jest.json`** — two load-bearing deviations from the app config: `moduleResolution: "node16"` (for subpath exports like `@opentelemetry/…/incubating`) and `isolatedModules` deliberately **unset** (so `await import()` isn't downlevelled to `require()`).
- **File layout** — unit tests live in `src/modules/<name>/tests/unit/**`, `tests/unit/{middlewares,infrastructure,kernel,jobs,db,scripts}/**`; shared harness in `tests/support/**`.
- **Commands** — `npm run test:unit`, `npm run test:unit:coverage`, `npx jest <path>`.
- **Express Request/Response doubles** — middleware tests build hand-rolled `jest.fn()` chains rather than using `supertest`; real HTTP is reserved for Contract Testing.

## Relationships

- **`src/modules`, `src/kernel`, `src/infrastructure`** (see `src-modules.md`, `src-infrastructure.md`) — the source code this layer tests.
- **`docs/tools/integration-testing.md`** — repository/service/model tests that need a real (in-memory) MongoDB live there via `setupTestDb()`; this layer explicitly excludes database and HTTP.
- **`docs/tools/mutation-testing.md`** — Stryker mutates this layer's source and verifies these tests go red; mutation score subsumes coverage here.
- **`docs/tools/contract-testing.md`** — inherits `tsconfig.jest.json`; real HTTP and response-shape assertions start at this layer, not here.
- **`docs/tools/contract-request-data.md`** — records why `@faker-js/faker` (ESM-only) cannot be imported in this CJS Jest suite.
- **`docs/reference/tests.md`** — the "Three numbers" section clarifies that unit coverage, integration coverage, and mutation score answer different questions.
- **`docs/tools/testing-and-docs.md`** — parent overview page for the whole test suite.
- **`.dependency-cruiser.cjs` / `eslint.config.ts`** — structural enforcement that `tests/unit/**` stays database-free (transitive rule) and cannot import restricted modules.

## Notes

- **Coverage ≠ correctness.** A line can be executed by a test that asserts nothing. Mutation testing is the quality instrument; coverage is kept only because it is cheap.
- **`isolatedModules` is intentionally absent.** ts-jest's warning about it is noise; setting it breaks dynamic `import()` calls under Jest's CJS VM.
- **The dependency-cruiser `unit-layer-stays-database-free` rule is transitive** — it catches a spec that reaches a database through a helper, which a per-file `no-restricted-imports` lint or a text sweep would miss.
- **No HTTP, no database.** No unit test sends a request through Express routing or opens Mongo. Both boundaries are enforced structurally, not by review.
