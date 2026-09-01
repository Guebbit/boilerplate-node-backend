---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: tests/support/
files: 20
updated: 2026-08-31T20:58:22.906310+00:00
---

# tests/support/

## Purpose

Shared test infrastructure for the entire project. It provides the database lifecycle, HTTP harnesses, fixture generation, environment bootstrap, and assertion utilities that every other test suite (unit, integration, cross-cutting, and per-module) relies on, so that no individual test file needs to re-wire Mongoose, Express, i18next, or the OpenAPI contract.

## Key parts

- **Database lifecycle** — `global-setup.ts` / `global-teardown.ts` start and stop a single in-memory MongoDB for the whole run; `database.ts` exposes `connect` / `disconnect` / `clearAll` for per-file isolation; `setup-test-db.ts` registers the `beforeAll`/`beforeEach` hooks that wipe collections between test cases.
- **HTTP & contract testing** — `http.ts` (supertest harness over the full Express pipeline), `contract.ts` (registers `jest-openapi` assertions against `openapi.yaml`), `contract-data.ts` (Zod-schema-driven payload generator for fuzz-style contract tests), `spec-walk.ts` (derives the endpoint list from the spec), `race.ts` (fires N simultaneous requests for concurrency verification).
- **Bootstrap & environment** — `setup.ts` (Jest `setupFiles` hook that sets env vars and initialises i18next/validation messages before any `src/` module is imported), `i18n-boot.ts` (reproduces the production import ordering so specs see real translated copy), `environment.ts` (`withEnvironment` helper for safe per-test env mutation).
- **Response & assertion helpers** — `response.ts` (type-safe narrowing of the `ResponseSuccess | ResponseReject` union), `express.ts` (chainable `Response` stub for middleware unit tests), `stub.ts` (single sanctioned `as`-cast export that ESLint enforces everywhere else).
- **Introspection & configuration** — `routes.ts` (serialises an Express router's route table into an assertable string; mocks middleware factories for visibility), `schema.ts` (reads Mongoose schema declarations — required fields, indexes, enums — at runtime).
- **Miscellaneous** — `caller-context.ts` (minimal fixture for service-level tests), `ports.ts` (portable spied port helper that avoids `spyOn` issues under Stryker/transform pipelines), `migrations.ts` (loads and runs the real `db/migrations/` files against the test database).

## How it connects

- **`tests/`, `tests/unit/`, `tests/cross-cutting/`, `tests/unit/infrastructure/`** — all of these consumer suites import the DB helpers, HTTP harness, and assertion utilities from this directory; this module is the shared foundation they build on.
- **`src/modules/*/tests/`** (account, orders) — per-module integration tests call `setup-test-db.ts` for isolation and `http.ts` for full-pipeline requests.
- **`db/`** — `migrations.ts` reads and executes the real migration scripts from `db/migrations/`; `database.ts` and `setup-test-db.ts` connect Mongoose to the same models defined there.
- **`src/` / `src/infrastructure/`** — `setup.ts` and `i18n-boot.ts` exist specifically so that `src/` modules (rate limiters, Zod message thunks, JWT config, i18next) capture their configuration at import time rather than later.
- **`src/modules/locales/`** — `i18n-boot.ts` reproduces the exact import ordering that `locales/` relies on in production, catching the class of bug where `t()` is called before `i18next.init()`.

## Where to start

1. **`setup.ts`** — read this first because it explains the "why" behind the entire bootstrap sequence (env vars, i18next, validation messages) and the ordering constraint that several other files in this directory exist to enforce.
2. **`http.ts`** — the single most-used entry point for integration-style tests; understanding its chainable API and how it plugs into `contract.ts` and `setup-test-db.ts` gives you a working mental model of how a typical test file is assembled.

## Connected modules
```mermaid
flowchart LR
    m_tests_support["tests/support/"]
    m_root["/ (repository root)<br/>44 files"]
    m_db["db/<br/>21 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules["src/modules/<br/>20 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>19 files"]
    m_src_modules_cart["src/modules/cart/<br/>37 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>19 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_locales["src/modules/locales/<br/>32 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>20 files"]
    m_src_modules_payments["src/modules/payments/<br/>22 files"]
    m_src_modules_products["src/modules/products/<br/>30 files"]
    m_tests_support --- m_root
    m_tests_support --- m_db
    m_tests_support --- m_src
    m_tests_support --- m_src_infrastructure
    m_tests_support --- m_src_infrastructure_adapters
    m_tests_support --- m_src_modules
    m_tests_support --- m_src_modules_account_tests
    m_tests_support --- m_src_modules_cart
    m_tests_support --- m_src_modules_delivery
    m_tests_support --- m_src_modules_feedback
    m_tests_support --- m_src_modules_inventory
    m_tests_support --- m_src_modules_locales
    m_tests_support --- m_src_modules_orders_tests
    m_tests_support --- m_src_modules_payments
    m_tests_support --- m_src_modules_products
    style m_tests_support stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_db|db/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] · [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] · [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · … and 7 more

## Files
- `tests/support/caller-context.ts` — Provides a minimal `CallerContext` fixture for tests that invoke service functions directly, bypassing the HTTP controller layer that would normally construct one from an incoming request. Most service-level tests don't need a meaningful caller identity—only that the field is present so the code path doesn't throw on a missing value.
- `tests/support/contract-data.ts` — A Zod-schema-driven fixture generator that produces valid and invalid request payloads for contract testing. It recursively walks a Zod v4 schema's `_zod.def` introspection surface to emit deterministic, seed-reproducible data, answering "does the API honour its contract for *any* legal input?" — a question the per-module hand-written factories in `tests/fixtures.ts` don't cover. It is additive; deterministic scenario tests still use the hand-written factories.
- `tests/support/contract.ts` — Side-effect setup file that registers `jest-openapi` with the project's `openapi.yaml` spec, making the `toSatisfyApiSpec()` assertion available globally. It exists to guard against over-serialization (leaking `_id`, `password`, populated sub-documents, etc.) by validating real HTTP responses against the OpenAPI document — a check that the generated Zod schemas cannot provide in this repo.
- `tests/support/database.ts` — Provides the three-lifecycle test-database helpers (`connect`, `disconnect`, `clearAll`) that every DB-touching integration test uses. It connects Mongoose to a **shared** in-memory Mongo started once by `globalSetup`, allocating a unique database name per test file to preserve isolation without spawning a `mongod` per file.
- `tests/support/environment.ts` — Provides a single test helper, `withEnvironment`, that temporarily sets one `process.env` key for the duration of an async test body and then restores the original state. It exists because the codebase's config layer (`@infrastructure/runtime/environment`) reads every value lazily at the point of use, so tests can vary a single setting in isolation — but only if the variable is reliably restored afterward.
- `tests/support/express.ts` — Provides a chainable Express `Response` stub for unit tests that assert on what a middleware, error responder, or controller rejection path sends. It is intentionally *not* a replacement for integration testing via `tests/support/http.ts` — it answers "what did this function try to send", not "what does the API actually return".
- `tests/support/global-setup.ts` — Jest global setup that starts a single in-memory MongoDB server for the entire test run and passes its connection URI to worker processes via environment variables. It also owns the on-disk data directory for that server (under the repo's gitignored `.tmp/`) and sweeps directories left behind by dead sibling instances, preventing unbounded disk growth caused by Stryker's SIGKILL-then-restart cycle.
- `tests/support/global-teardown.ts` — Jest global teardown hook that cleans up after a test instance finishes: stops the shared in-memory MongoDB started by `global-setup.ts` and deletes the instance's temporary data directory. It exists so that no leftover processes or temp files outlive a test run.
- `tests/support/http.ts` — HTTP-level test harness that lets contract tests exercise the full Express pipeline (routing, middleware, auth, serialization, error handler) via `supertest`, rather than calling services or repositories directly. This is the only layer where a response body can be meaningfully compared against `openapi.yaml`.
- `tests/support/i18n-boot.ts` — Test infrastructure that reproduces the production import ordering—module code loads *before* `i18next.init()`—which Jest's `setupFiles` normally masks. It exists so specs can assert real translated copy and catch the class of bug where an eagerly-called `t()` bakes `undefined` into Zod validators because i18next was not yet initialised.
- `tests/support/migrations.ts` — Shared test-support module that loads the real CommonJS migration files from `db/migrations/` the same way `migrate-mongo` would (disk scan, filename sort, `require`), and exposes helpers to run them against the live test database. It exists so the two migration-focused integration suites have a single, unambiguous definition of "the migration set" rather than each maintaining its own loading logic.
- `tests/support/ports.ts` — A single-function test helper that hands out a `jest.fn()`-backed port (e.g. `emitAuditEvent`, `emitAnalyticsEvent`) with its call history cleared, so tests can assert "this event fired, that one didn't" from a known-clean baseline. It exists because the naïve `jest.spyOn(namespace, 'fn')` pattern is not portable across the project's transform pipeline (`ts-jest` vs `@swc/jest`) and Stryker's instrumented sandbox, where CommonJS namespace getters are non-configurable and `spyOn` throws a `TypeError`.
- `tests/support/race.ts` — Concurrency-test harness that fires N identical HTTP requests truly simultaneously and exposes per-participant outcomes for assertion. It exists because serial test suites (and mutation testing) cannot verify that a race condition is actually handled — the question is "does it still do the right thing when all of it happens at once?"
- `tests/support/response.ts` — Test helper that narrows a service's `ResponseSuccess<T> | ResponseReject` union at the assertion site. Instead of an inline `as` cast (which silently succeeds even when the wrong arm is hit), these helpers **assert the expected branch first**, so a response that took the wrong path fails on that single, readable fact before any property is read from it.
- `tests/support/routes.ts` — Test-support utility that reads an Express router's mounted route table (method, path, middleware chain) back into an assertable string form. It also provides `jest.mock` factories that replace middleware *factories* (cache, rate-limit, route-flag, storage) with labelling wrappers so their call arguments — TTL, tags, field names, flag values — appear in the route table where anonymous closures would otherwise hide them. The goal: a route file's full configuration is a one-line snapshot, and any change to it (dropped auth, renamed cache tag, wrong path) forces a visible test edit.
- `tests/support/schema.ts` — A set of read-only introspection helpers that extract a Mongoose schema's contract (required fields, indexes, defaults, enums, nested schemas, schema-level options) directly from the schema object at runtime. This lets unit tests assert the *declaration* of a schema — things that don't change the shape of a valid document but break quietly (a dropped `required`, a renamed index, a missing `_id: false`) — without spinning up a database or round-tripping a document.
- `tests/support/setup-test-db.ts` — Registers Jest lifecycle hooks (`beforeAll` / `afterAll` / `beforeEach`) that connect to the run's shared in-memory mongod and wipe every collection before each test case. It exists so that any suite touching Mongo gets an isolated, empty database per `it()` without each test file repeating the boilerplate.
- `tests/support/setup.ts` — Global Jest bootstrap (wired via `setupFiles`) that runs once per worker **before** any test module is imported. It sets the environment variables and initialises the i18next / validation-message machinery at a point where downstream modules are about to read them at import time. Setting these later (e.g. in `beforeAll`) would be too late because rate limiters, Zod message thunks, and JWT config are captured on first import.
- `tests/support/spec-walk.ts` — Derives the full list of HTTP operations (and their schemas) directly from `openapi.yaml`, so the fuzz test suite automatically covers every route the spec declares without anyone manually maintaining an endpoint list. It is intentionally limited to the schema subset this repo actually uses and is *not* a general OpenAPI parser.
- `tests/support/stub.ts` — Provides a single sanctioned cast helper for hand-built test stubs. Because framework types (`Request`, `Response`, Mongoose `CastError`, etc.) have hundreds of members that a minimal stub cannot structurally satisfy, some cast is unavoidable. This file centralizes that cast behind one named export so the ESLint `no-restricted-syntax` rule can ban the raw `as unknown as T` spelling everywhere else in the codebase.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
