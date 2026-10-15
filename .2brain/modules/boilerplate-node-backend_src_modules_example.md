---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/example/
files: 39
updated: 2026-10-15T13:38:55.585880+00:00
---

# src/modules/example/

## Purpose

A fully-fleshed reference implementation of a domain module. It demonstrates every layer (config → model → repository → service → controller → route) and every optional capability (analytics, audit, metrics, webhooks, personal-data, cover images, notifications) that the application expects a domain to provide. It is explicitly a copy-paste template: `module.ts` notes it is expected to be deleted once a real module replaces it.

## Key parts

- **Domain & model** — `domain/lifecycle.ts` (pure status-transition rules), `domain/index.ts` (barrel), `model.ts` (Mongoose schema + wire-shape transform). Together they define what an "example" is and what state changes are legal.
- **Service layer** — `services/crud.ts` is the single CRUD door (domain rules, auth scoping, side-effects). `services/cover.ts`, `services/notify.ts`, `services/owner.ts`, and `services/personal-data.ts` each own one optional capability. `services/index.ts` bundles them into the `exampleService` object that controllers consume.
- **HTTP surface** — `routes.ts` (route table + positional auth gate + middleware wiring) and the `controllers/` directory (one thin file per HTTP verb, all delegating to the service via shared factories). `presenter.ts` is the sole place a document is shaped into the OpenAPI wire type.
- **Data access & fixtures** — `repository.ts` (module-specific ops over the shared CRUD/search factory) and `factories.ts` (test/seed fixture builder, excluded from the public barrel).
- **Config & manifest** — `config.ts` (the only file that reads `process.env`) and `module.ts` (declares every capability the app wires up: routes, rate limits, webhooks, translations, image pipeline, personal-data handlers).
- **Observability & cross-cutting** — `analytics.ts`, `audit.ts`, `metrics.ts`, `events.ts` (each a self-contained augmentation that can be deleted in isolation); `rate-limits.ts`, `emails.ts`, `probes.ts`.
- **Public API** — `index.ts` is the only entry point sibling modules may import from.
- **Tests** — `tests/unit/` (domain logic, emails, analytics strings, manifest shape, route-table invariants), `tests/integration/` (CRUD against a real DB, capabilities, translations), `tests/contract/` (status-code coverage against `openapi.yaml`), and `tests/factories.ts` (build-and-store helpers).

## How it connects

- **`src/modules/users/`** — `services/owner.ts` is the single point where this module crosses into the users domain to resolve the owner's display name and apply the outranked-refusal rank rule.
- **`src/infrastructure/`** — The model persists via Mongoose; `analytics.ts`, `audit.ts`, and `metrics.ts` register into app-wide observability maps/registries; `events.ts` augments the kernel's `DomainEventMap`.
- **`src/infrastructure/http/`** — `routes.ts` and the controllers rely on shared HTTP utilities (auth guards, rate-limiter builder, controller factories for search/update/delete).
- **`src/infrastructure/adapters/`** — `services/notify.ts` dispatches through the mailer adapter; the cover-image pipeline and image-digest writeback go through the image-pipeline adapter declared in `module.ts`.
- **`src/modules/`** — The barrel pattern (`index.ts` as the sole import surface) and the `declare module` augmentation convention for events/analytics/audit follow the same structure used by every other module in the registry.
- **`src/`** — The presenter targets the wire type declared in `openapi.yaml` at the `src/` level; `config.ts` validates its slice of the shared environment schema.
- **`scenarios/`** — `factories.ts` is consumed by seed data and scenario fixtures so they can build documents without exercising the full service pipeline.

## Where to start

1. **`services/crud.ts`** — It is the single door through which every create/read/update/delete flows, and it shows how domain rules, auth scoping, persistence, and side-effects compose in one place.
2. **`domain/lifecycle.ts`** — A short, dependency-free file that captures the core business invariant (legal status transitions) and makes the rest of the module's complexity easier to interpret once you know what "published" means.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_example["src/modules/example/"]
    m_scenarios["scenarios/<br/>42 files"]
    m_src["src/<br/>35 files"]
    m_src_infrastructure["src/infrastructure/<br/>70 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>34 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules["src/modules/<br/>59 files"]
    m_src_modules_users["src/modules/users/<br/>54 files"]
    m_src_modules_example --- m_scenarios
    m_src_modules_example --- m_src
    m_src_modules_example --- m_src_infrastructure
    m_src_modules_example --- m_src_infrastructure_adapters
    m_src_modules_example --- m_src_infrastructure_http
    m_src_modules_example --- m_src_modules
    m_src_modules_example --- m_src_modules_users
    style m_src_modules_example stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/example/analytics.ts` — Declares the analytics event names the example module fires and registers them into the app-wide `AnalyticsEventMap` via a TypeScript module augmentation. This is an **optional, self-contained capability file**: deleting it (and the corresponding `emitAnalyticsEvent` call in the service layer) removes the module from analytics entirely.
- `src/modules/example/audit.ts` — Declares the audit-action vocabulary owned by the `example` module and registers it into the app-wide `AuditActionMap` union via TypeScript module augmentation. This lets the observability infrastructure (`@infrastructure/observability/audit`) understand every valid action the module can emit, while keeping the union open for extension by other modules.
- `src/modules/example/config.ts` — Declares and validates the example module's slice of the environment at boot. It is the **only** file in the module that reads `process.env`; every other file consumes the typed values it exports.
- `src/modules/example/controllers/delete-example.ts` — Handles `DELETE /examples/:id` by validating the id, delegating the permanent removal to `exampleService.remove`, and shaping the HTTP response. It is hand-written (rather than generated by the shared delete factory) because this module has only a single hard-delete tier and no soft-delete flag to manage.
- `src/modules/example/controllers/get-example.ts` — Defines the two read-one (GET by id) HTTP handlers for the `example` module: the authenticated `GET /examples/:id` and the publicly accessible `GET /examples/published/:id`. Both are thin delegations to the shared item-controller factory, which centralises 404 handling so that an unknown id and a malformed id produce the same response.
- `src/modules/example/controllers/get-examples.ts` — Thin HTTP wiring for the examples module's two search endpoints (`GET /examples` and `POST /examples/search`). It decodes and validates the incoming request, delegates to the example service, and returns a shaped response — all via the shared search-controller factory so no manual routing or response-building logic lives here.
- `src/modules/example/controllers/post-example.ts` — Controller handler for `POST /examples`. Validates the request body against the generated Zod schema, delegates to `exampleService.create`, and returns `201 Created` with a `Location` header on success.
- `src/modules/example/controllers/put-example-cover.ts` — Controller handler for `PUT /examples/:id/cover`. Reads the already-processed image upload from the request (performed by middleware in `routes.ts`) and delegates to `exampleService.setCover` to persist the new cover and thumbnail URLs for the given example.
- `src/modules/example/controllers/update-example.ts` — Defines the two HTTP handlers for `PUT /examples/:id` (full replace) and `PATCH /examples/:id` (partial merge) by calling the shared `createUpdateController` factory. The file's only job is to supply the module-specific pieces — the two Zod schemas, the entity metadata, and the service delegation — while the factory owns the common pipeline (id resolution, `If-Match`/`ETag`, 404 handling).
- `src/modules/example/domain/index.ts` — Barrel entry point for the example module's domain layer. It re-exports a closed set of pure business-rule functions from `./lifecycle` so that consumers (services, tests, other modules) import from a single, stable path. The file itself contains no logic — only re-exports — and is guaranteed by lint rules to have zero framework or tier dependencies (no Express, no Mongoose, no I/O).
- `src/modules/example/domain/lifecycle.ts` — Pure business rules governing the status lifecycle of an example (draft → published → archived). It defines which status transitions are legal, when the `publishedAt` stamp is set, and two small helpers (read-visibility, body-length check) — all without any I/O.
- `src/modules/example/emails.ts` — Produces the finished, language-specific email copy (subject, greeting, body, footer) that an owner receives when their example is published. The file is a pure text-shaping layer: it receives a locale and a few display values, runs them through the i18n translator, and returns a typed `EmailContent` object ready for the mailer adapter to dispatch. No rendering or logic resolution happens here.
- `src/modules/example/events.ts` — Declares the domain events emitted by the `example` module. It augments the kernel's app-wide `DomainEventMap` with this module's event payloads (a pattern chosen over a central event list, per the convention in `modules/orders/events.ts`). Each event declared here is also exposed as a public webhook via `module.ts`.
- `src/modules/example/factories.ts` — Provides a single factory function (`makeExample`) that builds partial `ExampleDocument` objects ready for `exampleRepository.create`. It exists so that tests and seeds can construct fixtures without going through the service layer (which enforces domain rules the fixture does not need to satisfy). Exposed at the path alias `@modules/example/factories`; deliberately excluded from the module barrel.
- `src/modules/example/index.ts` — Public barrel for the `example` module. It is the **only** entry point a sibling module is allowed to import from, re-exporting services, domain rules, events, emails, and the model's type surface. Everything else (repositories, model runtime values, wiring, `factories.ts`) is deliberately excluded.
- `src/modules/example/metrics.ts` — Defines the Prometheus counters owned by the example module and registers them on the shared observability registry. The file is intentionally self-contained: removing it (and the corresponding `.inc()` call at the usage site) fully disables module metrics with no other cleanup needed.
- `src/modules/example/model.ts` — Defines the Mongoose schema, document/model types, and shared wire-shape transform for the "example" resource (a note with an owner, status, and optional cover image). Every other file in the module reads or writes this collection through the exports here, so the schema and serialization rules live in one place.
- `src/modules/example/module.ts` — The module entry-point and manifest for the `example` domain. It declares every capability the application should wire up on the module's behalf (routes, config, rate limits, webhooks, translations, image pipeline, personal-data handlers). Its sole production role is to serve as a copy-paste template for new domains; it is expected to be deleted once a real module replaces it.
- `src/modules/example/presenter.ts` — The single place where a stored `Example` document or search row is shaped into the `Example` wire type declared in `openapi.yaml`. It exists so every read and write path returns the identical contract shape, and it supplies the one field the document cannot provide on its own: `ownerName` (owned by `users`, passed in by the caller).
- `src/modules/example/probes.ts`
- `src/modules/example/rate-limits.ts` — Declares the "example" module's rate-limit budgets as typed data and converts them into Express middleware via the shared `buildRateLimiter` helper. It is an optional, self-contained capability file: deleting it (and its route mount) removes rate limiting from the module entirely.
- `src/modules/example/repository.ts` — The single access point to the `example` collection within the module. It layers module-specific operations (scoped reads, translation writeback, image-pipeline writeback, optimistic publish, hard-delete) on top of the shared CRUD/search factory. Only the module's services import it; nothing outside the module touches the collection directly.
- `src/modules/example/routes.ts` — Express route table for the example module. Declares public vs. private endpoints by their positional placement relative to a single `isAuth` guard, wires per-route permission, cache, rate-limit, and upload middleware, then delegates to the module's controllers.
- `src/modules/example/services/cover.ts` — Implements the optional cover-image capability for the `example` module. After upload middleware has quarantined the bytes, this service writes the new image fields onto the document, enqueues a pending image to the digest pipeline, deletes the previously-replaced image, records an audit row, and shapes the success response.
- `src/modules/example/services/crud.ts` — The single CRUD service door for the Example module. Controllers and sibling modules call its exports (`create`, `getById`, `getPublishedById`, `search`, `update`) rather than the repository directly. It applies domain rules (status transitions, body length), enforces row-level access by compiling the caller's authorization keys into query filters, persists via the repository, and announces side effects (audit log, analytics event, outbox domain event).
- `src/modules/example/services/index.ts` — Service-layer façade for the `example` module. It re-exports the individual capability functions (CRUD + cover) and bundles them into a single `exampleService` object, giving controllers one stable entry point while allowing optional capabilities to live in their own files.
- `src/modules/example/services/notify.ts` — Optional event-bus listener that emails the owner of a newly published example, localized to the owner's language. It exists as a standalone capability that can be removed entirely (along with `emails.ts`, `templates/`, and the `subscribe` line in `module.ts`) without affecting the publish flow.
- `src/modules/example/services/owner.ts` — The single point where the `example` module reads another module's data (the owner's display name) and applies the outranked-refusal rank rule. It exists so that every path that needs "whose example is this" resolves the name and enforces the rank check in one place, keeping the contract's `Example` shape free of a stored denormalized name.
- `src/modules/example/services/personal-data.ts` — Implements the two GDPR-style personal-data operations for the `example` module: exporting all examples owned by a given user (`collectPersonalData`) and erasing them (`eraseForUser`). The functions are registered on the module manifest as `personalData`, so `account` and `users` invoke them indirectly through the kernel registry without importing this file.
- `src/modules/example/tests/contract/api.contract.test.ts` — Contract tests for the `/examples` API surface. Every route is exercised over HTTP and its response status is checked against the declarations in `openapi.yaml`. The goal is to guarantee each declared status code (200, 201, 401, 403, 404, 422) is actually reachable; behavioural and business-logic assertions live in the separate integration suite.
- `src/modules/example/tests/factories.ts` — Test-scoped persistence helpers that wrap the domain factory and repository with a one-call "build + store" entry point, so test files never need to compose `makeExample` and `exampleRepository.create` themselves.
- `src/modules/example/tests/integration/capabilities.test.ts` — Integration test suite that exercises the example module's optional capabilities against a real test database: the publish notification mail, cover-image upload/rotation, personal-data export and erasure (GDPR-style), the two repository writes the `locales` port performs on the collection, and the image-digest writeback guard. Each capability is proved in isolation so that a regression in one does not mask a break in another.
- `src/modules/example/tests/integration/service.test.ts` — Integration tests for the example service CRUD operations run against a real database. Verifies ownership scoping (own / any / nothing), status-lifecycle enforcement on write, one-time `publishedAt` stamping, exactly-once publish announcement via the outbox, body-ceiling enforcement from the environment, and that audit/analytics events fire on create.
- `src/modules/example/tests/integration/translations.test.ts` — Integration test that exercises the `locales` translation endpoint end-to-end for the `example` module. It verifies the full contract: fallback-language writes are copied onto the row, non-fallback writes only create a translation slot, undeclared fields are rejected (422), and missing entities return 404.
- `src/modules/example/tests/unit/analytics.test.ts` — Unit test that pins the exact string values of the example module's analytics events and verifies they are registered in the app-wide `AnalyticsEventMap` union. It exists to prevent accidental string changes (which would break Umami dashboards) and to guard against the `declare module` augmentation being silently removed.
- `src/modules/example/tests/unit/domain.test.ts` — Unit tests for the example domain's lifecycle rules: which status transitions are legal, when `publishedAt` gets stamped, and the body-length ceiling. Pure logic assertions with no database or network involvement.
- `src/modules/example/tests/unit/emails.test.ts` — Unit tests for the `examplePublishedEmail` helper, verifying that the published-example email copy (subject, greeting, body) is correctly resolved for a given locale and owner name.
- `src/modules/example/tests/unit/manifest.test.ts` — Verifies the public-facing contract of the `example` module manifest: what event subscribers see, which fields are translatable, how image targets and personal-data handlers are registered, and how the rate-limit budget is shaped. It exists to catch accidental changes to the module's outward projection without requiring an integration environment.
- `src/modules/example/tests/unit/routes.test.ts` — Unit test that pins down the **structural invariants** of the example route table: the exact set and order of mounted endpoints, which routes sit above vs. below the positional auth gate (`getAuth` / `isAuth`), and the relative ordering of middleware in specific chains. It exists because the auth boundary is purely positional — a route placed on the wrong side of `router.use(getAuth, isAuth)` compiles fine and fails silently — so the test encodes that constraint as executable assertions rather than relying on types.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
