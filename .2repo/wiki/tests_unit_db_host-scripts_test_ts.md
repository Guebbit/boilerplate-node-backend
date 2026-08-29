# tests/unit/db/host-scripts.test.ts

## Purpose

Validates the `npm run host -- <script>` wrapper and the database URI resolution logic it depends on. It guards against a class of silent failures where a script hardcodes a connection string (and with it a database name) that contradicts `.env`, causing `db:seed` or `db:migrate:up` to target the wrong database with no diagnostic output. The file pins five invariants: no literal URI in the wrapper, single source of hostname redirection, empty-string URI fallthrough, `migrate-mongo-config.js` parity with the application, and loopback-IPv4 targeting.

## Key elements

- **`hostScript`** — extracted from `package.json` at load; every assertion in the first `describe` block inspects this string.
- **`migrateMongoUri()`** — re-evaluates `migrate-mongo-config.js` via `jest.isolateModules` + `require` so it picks up the *current* `process.env` (a top-level import would cache one answer).
- **`MONGO_VARS`** — the four env keys (`NODE_DB_URI`, `NODE_MONGODB_HOST`, `NODE_MONGODB_PORT`, `NODE_MONGODB_NAME`) that every URI-resolution test saves/restores around.
- **`describe('the host script')`** — static assertions on the npm script string: no `mongodb://`/`redis://` literal, no hardcoded DB name, blanks both `*_URI` vars, sets `*_HOST=127.0.0.1`, ends with `npm run`, and is the *only* script matching a hostname-redirect pattern.
- **`describe('database URI resolution')`** — exercises `getDatabaseUri()` from the source: explicit-URI preference, empty-string fallthrough to fragments, renamed-database correctness, and sensible defaults.
- **`describe('migrate-mongo agrees with the application')`** — a six-row matrix comparing `migrateMongoUri()` output against `getDatabaseUri()` under varied env shapes, plus a separate assertion that the *name* (not just the shape) is correct.
- **`jest.mock('dotenv', …)`** — stubs `dotenv.config` to return `{ parsed: {} }`, preventing the developer's local `.env` from leaking into the resolution matrix.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — the sole production import (`getDatabaseUri`). The URI-resolution and parity suites directly exercise this function's contract: explicit-URI short-circuit, empty-string fallthrough, and fragment assembly.
- **`migrate-mongo-config.js`** (project root) — loaded via `require` inside `jest.isolateModules`; the parity suite asserts its resolved `mongodb.url` equals `getDatabaseUri()` for every env permutation.
- **`package.json`** (project root) — read synchronously to obtain the `host` script string and all sibling script names (for the "only redirector" invariant).

## Notes

- The empty-string URI check (`NODE_DB_URI = ''`) is the load-bearing invariant. A `!== undefined` guard would pass `''` through as a "configured" URI and break the `:host` mechanism. The test is deliberately named to call this out.
- `127.0.0.1` is asserted *against* `localhost` on purpose: on a dual-stack host, `localhost` may resolve to `::1` first, while Docker/Podman publish to IPv4 only. The name is not interchangeable.
- The `eslint-disable` on the `require` call is intentional — `jest.isolateModules` needs a synchronous `require` to re-execute the CommonJS module; `import()` would return the cached namespace and the test would be vacuous.
- `dotenv` is mocked at module scope. Without the mock, the developer's `.env` values would override the matrix's controlled `process.env` assignments, making results machine-dependent.
