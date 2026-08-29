# docs/tools/unit-testing.md

## Purpose

Documents the unit-testing layer: what it covers (services, repositories, models, middleware, adapters, kernel, jobs), the tooling (Jest + ts-jest), the patterns that keep tests isolated from HTTP and databases, the file layout, and the relevant `tsconfig.jest.json` decisions. It is also the explicit target layer for Mutation Testing (Stryker).

## Key elements

- **Jest + ts-jest** — test runner and TypeScript transform for the whole suite.
- **`jest.mock()`** — selective replacement of external adapters (filesystem, mailer, cache) at the import boundary; the code under test still runs for real.
- **`tsconfig.jest.json`** — Jest-specific TS config. Uses `module`/`moduleResolution: "node16"` (required for subpath-export imports) and deliberately omits `isolatedModules` (prevents ts-jest from downlevelling `await import()` to `require()` under CJS).
- **`jest.config.js`** — `testMatch`, path aliases, `setupFiles`.
- **`tests/support/factories/*`** — `makeX()`/`createX()` pairs per entity.
- **`tests/support/setup-test-db.ts` / `database.ts`** — `mongodb-memory-server` lifecycle (used by Integration Testing, not this layer).
- **`tests/support/setup.ts`** — global Jest setup (rate-limit override, i18next init).
- **`tests/cross-cutting/unit-layer-is-framework-free.test.ts`** — enforces that unit tests never import Express/Mongoose.
- **Commands** — `npm run test:unit`, `npm run test:unit:coverage`, `npx jest <path>`.

## Relationships

- **`docs/tools/tools-explained.md`** — sibling page in the tools documentation set; no direct code-level interaction described in this file.
- **`docs/tools/integration-testing.md`** (referenced in-file) — picks up exactly where unit testing stops: real HTTP via Express, real (in-memory) MongoDB. Unit tests explicitly avoid both.
- **`docs/tools/mutation-testing.md`** (referenced in-file) — Stryker mutates the source that this layer tests and reruns the unit suite per mutant.
- **`docs/tools/contract-testing.md`** (referenced in-file) — boundary: real HTTP requests begin here, not in unit tests.

## Notes

- **Hard boundary, structurally enforced:** `eslint.config.ts` (`no-restricted-imports`) blocks `tests/unit/**` from importing Express or Mongoose; a cross-cutting test asserts the same. This is not convention—it's a compile/lint gate.
- **No database at unit scope.** Stryker reruns `tests/unit` once per mutant; a DB connection here would be paid thousands of times. Anything needing real Mongoose behaviour goes to Integration Testing via `setupTestDb()`.
- **Middleware tests** build hand-rolled `Request`/`Response` doubles (`jest.fn()` chains for `.set()`, `.status()`, `.json()`) rather than `supertest`. Real HTTP is a Contract-Testing concern.
- **`isolatedModules` is intentionally absent** despite ts-jest's warning. Setting it would cause `await import()` to downlevel to `require()`, breaking dynamic imports under Jest's CJS VM.
- **`@faker-js/faker` (ESM-only, v10+)** cannot be imported directly in this suite due to the CJS constraint above. See `contract-request-data.md` for the workaround used.
- **`jest.mock()` scope:** only the external round-trip (e.g., Redis call) is replaced. The middleware's own logic (TTL clamp, size limit) executes for real because it is the subject under test.
