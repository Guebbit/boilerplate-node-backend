---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/users/
files: 49
updated: 2026-10-08T00:01:00.272299+00:00
---

# src/modules/users/

## Purpose

The `users` module owns the user aggregate: its schema, credentials, tokens, 2FA records, and OAuth links, plus the full administrative lifecycle (create, update, soft/hard delete, restore, search) exposed as a REST API. It is the single source of truth for "who is a user" and provides the identity primitives that the `account` module (sessions, sign-in flows) and every other bounded context consume.

## Key parts

- **Domain model & persistence** — `model.ts` defines the Mongoose schema, token subdocuments, 2FA records, OAuth links, and the password pre-save hash hook. `repository.ts` wraps the shared `createRepository` factory and is the only sanctioned place to re-select the `select: false` credential fields. `factories.ts` builds schema-default-faithful fixtures.
- **Service layer** (`services/`) — Business logic split by concern: `create.ts`, `update.ts`, `remove.ts`, `read.ts`, `signup.ts`, `tokens.ts`, `credentials.ts`, `validation.ts`, `image.ts`, `lookups.ts`, `reaper.ts`, `reencrypt.ts`. `services/index.ts` re-exports the public service surface.
- **HTTP layer** — `routes.ts` defines the admin-only `/users` Express router and wires middleware (auth, rate-limit, cache, upload). `controllers/` holds one thin adapter per endpoint (create, update, delete, restore, get, get-users). `openapi.yaml` is the OpenAPI 3.0.3 contract for the full REST surface.
- **Module wiring & cross-cutting contracts** — `module.ts` is the `AppModule` manifest (routes, permissions, locales, config, personal-data export/erasure hooks). `index.ts` is the sole public barrel for sibling modules. `events.ts`, `analytics.ts`, and `audit.ts` extend app-wide type maps via declaration merging. `config.ts`, `presenter.ts`, and `erasure-registry.ts` round out the module's boot-time configuration and GDPR-erasure integration.
- **Tests** (`tests/`) — Contract tests (OpenAPI conformance, no-field-leak), integration tests (repository, model invariants, reaper, image-clear), and a test-only DB factory (`tests/factories.ts`).

## How it connects

- **`src/modules/account/`** — The closest sibling. The users repository explicitly exposes credential, token, OAuth-link, and inactivity-sweep methods "that the `account` module needs across the shared-kernel edge." Account handles sessions and sign-in; users owns the identity record.
- **`src/infrastructure/http/`** — `routes.ts` and the controllers build on the shared HTTP infrastructure (Express router utilities, middleware composition, response shaping) provided by the infrastructure layer.
- **`src/modules/` (sibling modules)** — Siblings never reach into internal files; they import exclusively through `index.ts`. The `erasure-registry.ts` file exists precisely because `users` cannot import other modules' manifests (circular-dependency constraint); entries are injected at boot via the `onRegistered` hook.
- **`src/modules/observability/`** — `analytics.ts` and `audit.ts` register their event/action names into app-wide maps that the observability layer consumes for dashboards and compliance exports.
- **`src/infrastructure/`** — The Mongoose model and repository depend on the shared database/ORM infrastructure; the repository factory (`createRepository`) is an infrastructure-level abstraction.

## Where to start

1. **`model.ts`** — Reading the schema first gives you the full shape of a user record (including which fields are `select: false`), the token/2FA/OAuth subdocuments, and the password hashing hook. Everything else in the module reasons about this document.
2. **`routes.ts`** — Walking the router from top to bottom shows every endpoint, its auth key, and which controller it delegates to, giving you a complete map of the module's public API before you dive into individual services.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_users["src/modules/users/"]
    m_scenarios["scenarios/<br/>42 files"]
    m_scripts_ops["scripts/ops/<br/>24 files"]
    m_src["src/<br/>34 files"]
    m_src_infrastructure["src/infrastructure/<br/>67 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>32 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules["src/modules/<br/>32 files"]
    m_src_modules_account["src/modules/account/<br/>107 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>41 files"]
    m_src_modules_addresses["src/modules/addresses/<br/>24 files"]
    m_src_modules_api_keys["src/modules/api-keys/<br/>21 files"]
    m_src_modules_cart["src/modules/cart/<br/>56 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>27 files"]
    m_src_modules_example["src/modules/example/<br/>39 files"]
    m_src_modules_invoicing["src/modules/invoicing/<br/>33 files"]
    m_src_modules_users --- m_scenarios
    m_src_modules_users --- m_scripts_ops
    m_src_modules_users --- m_src
    m_src_modules_users --- m_src_infrastructure
    m_src_modules_users --- m_src_infrastructure_adapters
    m_src_modules_users --- m_src_infrastructure_http
    m_src_modules_users --- m_src_modules
    m_src_modules_users --- m_src_modules_account
    m_src_modules_users --- m_src_modules_account_controllers
    m_src_modules_users --- m_src_modules_addresses
    m_src_modules_users --- m_src_modules_api_keys
    m_src_modules_users --- m_src_modules_cart
    m_src_modules_users --- m_src_modules_delivery
    m_src_modules_users --- m_src_modules_example
    m_src_modules_users --- m_src_modules_invoicing
    style m_src_modules_users stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_scripts_ops|scripts/ops/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] · [[boilerplate-node-backend_src_modules_addresses|src/modules/addresses/]] · [[boilerplate-node-backend_src_modules_api-keys|src/modules/api-keys/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_example|src/modules/example/]] · … and 9 more

## Files
- `src/modules/users/analytics.ts` — Declares the analytics event names for the user module's administrative actions and registers them into the app-wide `AnalyticsEventMap` type so that emitters (e.g. `service.ts`) can reference them in a type-safe, stringly-typed-free way. The events distinguish operator-initiated account actions from the self-signup path (`USER_SIGNED_UP`) so that dashboards can sum or split them independently.
- `src/modules/users/audit.ts` — Declares the audit action string constants owned by the users module and registers them into the app-wide `AuditActionMap` type via TypeScript declaration merging. It exists so that every audit event the users module emits uses a single, typed vocabulary, and so downstream consumers (query UIs, compliance exports) can filter by these exact action names.
- `src/modules/users/config.ts`
- `src/modules/users/controllers/create-user.ts` — Handles the `POST /users` endpoint (staff-initiated user creation). It parses the incoming request (JSON or multipart), validates the payload via the users service, delegates persistence to `userService.create`, and shapes the HTTP response. The update half of this controller pair lives in `update-user.ts`.
- `src/modules/users/controllers/delete-users.ts` — Thin controller that maps the two admin delete endpoints (`DELETE /users` and `DELETE /users/:id`) to the user service, delegating the actual deletion and selecting the correct audit action name. It exists so route registration stays decoupled from the deletion logic and the audit trail records *which* kind of delete (soft vs. hard) occurred.
- `src/modules/users/controllers/get-user-item.ts` — Controller for `GET /users/:id` — resolves a single user document by path id and returns it under the user contract shape. Admin-only. Exists as a thin adapter between the route layer and `userService`.
- `src/modules/users/controllers/get-users.ts` — Controller for `GET /users` (and `POST /users/search`) that lists or searches users via query parameters. It wraps the shared search-controller factory, validates the request with a Zod schema, delegates to `userService.search`, and enriches each returned user with their current role before responding.
- `src/modules/users/controllers/restore-users.ts` — Thin controller for `POST /users/:id/restore` that undoes an admin soft-delete of a user. It exists to keep the route layer declarative while delegating business logic to the users service and reusing the shared restore-controller factory.
- `src/modules/users/controllers/update-user.ts` — Defines the HTTP handlers for `PUT /users/:id` (full replace) and `PATCH /users/:id` (partial merge) by wiring the shared `createUpdateController` factory to `userService.updateById`. All business logic (field merging, audit, ban/unban split) lives in the service layer; this file only handles transport concerns.
- `src/modules/users/erasure-registry.ts` — Holds the `users` module's view of the DDD-D6 `personalData.erase` registry. Because `users` cannot import sibling modules under `src/modules/*` to collect their manifest entries itself (the same circular-dependency wall that motivates `@modules/account/services/personal-data-registry.ts`), the list is **supplied in once at boot** by the `onRegistered` hook rather than assembled here.
- `src/modules/users/events.ts` — Declares the domain events owned by the users module by augmenting the kernel's `DomainEventMap` interface, so the event catalogue grows per-module without a shared enumeration file.
- `src/modules/users/factories.ts` — Builds user document fixtures (seed accounts and test personas) by supplying only the fields a caller explicitly pins, leaving everything else to the Mongoose schema's defaults. It exists so that seeded rows reflect what the schema actually stores rather than duplicating or guessing at defaults.
- `src/modules/users/index.ts` — Public barrel for the `users` module — the sole import surface available to sibling modules (enforced per `docs/theory/strategic-ddd.md` §5). It re-exports the service, events, and selected model members so that external code never reaches into internal files directly.
- `src/modules/users/model.ts` — Defines the Mongoose schema and TypeScript interfaces for the user record, its token subdocuments, two-factor method records, and OAuth account links. Deliberately kept as a single file so the password pre-save hash hook stays colocated with the `select: false` casters that keep the hash off every read. Also re-exports `normalizeEmail` and provides the `hashToken` / `isLiveRefreshSession` helpers that other modules depend on for token comparison and session listing.
- `src/modules/users/module.ts` — The module manifest for the `users` module. It declares everything the kernel needs to wire up the module—routes, permissions, locales, image writeback targets, personal-data export sections, and required configuration—into a single `AppModule` object. It also resolves cross-module personal-data erasure hooks at registration time.
- `src/modules/users/openapi.yaml` — OpenAPI 3.0.3 contract (v2.0.0) that defines the full REST surface for the **users** module: list, create, delete, get-by-id, full-replace, and partial-update operations. It serves as the single source of truth for the module's request/response shapes, parameter semantics, and error responses, and is the document other tooling (codegen, client SDKs, docs) consumes.
- `src/modules/users/presenter.ts`
- `src/modules/users/repository.ts` — Persistence layer for the user collection. Wraps the shared `createRepository` factory with standard CRUD, then layers on the credential, token, OAuth-link, and inactivity-sweep operations that the `account` module needs across the shared-kernel edge. All sensitive fields (`password`, `tokens`, 2FA material, `oauthAccounts`, `pendingEmail`) are `select: false` on the schema; this file is the single sanctioned place to re-select them.
- `src/modules/users/routes.ts` — Defines the Express `Router` for the admin-only `/users` API surface (search, list, read, create, update, delete, restore, 2FA removal). It wires each endpoint to the appropriate authorization key, caching policy, rate-limit, upload, and route-flag middleware, then delegates to the per-action controllers.
- `src/modules/users/services/create.ts`
- `src/modules/users/services/credentials.ts`
- `src/modules/users/services/image.ts`
- `src/modules/users/services/index.ts`
- `src/modules/users/services/lookups.ts`
- `src/modules/users/services/read.ts`
- `src/modules/users/services/reaper.ts`
- `src/modules/users/services/reencrypt.ts`
- `src/modules/users/services/remove.ts`
- `src/modules/users/services/signup.ts`
- `src/modules/users/services/tokens.ts`
- `src/modules/users/services/update.ts`
- `src/modules/users/services/validation.ts`
- `src/modules/users/tests/contract/api.contract.test.ts` — Contract tests for the `/users` and `/account` endpoints. Because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, these tests verify that **no** undeclared field (password, tokens, a bcrypt hash) can leak into any user response — not just the ones a developer thought to name. They also pin endpoint-specific behavior: cache headers, HTTP status codes for error cases, PUT replace-vs-PATCH merge semantics, and password-provisioning rules on admin create.
- `src/modules/users/tests/factories.ts` — Test-only database factory for the `users` module. It wraps the plain-payload builder in `../factories` with a persistence step (`userRepository.create`) and role assignment, giving integration and contract tests a single `createUser` / `createAdminUser` entry point that returns a live Mongoose document. It also centralises the full password vocabulary (minimal, legacy, weak, replacement) so policy tests and flow tests share the same fixtures.
- `src/modules/users/tests/integration/hierarchy.test.ts`
- `src/modules/users/tests/integration/image-clear.test.ts`
- `src/modules/users/tests/integration/model.test.ts` — Integration test that verifies two invariants of the user model: (1) email addresses are stored and looked up case-insensitively via a unique index, and (2) credential fields (`password`, `tokens`) can never leak into a serialised response. The second invariant is checked at two independent layers — Mongoose `select: false` at the query level and the `toJSON` allowlist at the serialisation boundary — including `.lean()` results that bypass `toJSON` entirely.
- `src/modules/users/tests/integration/reaper.test.ts`
- `src/modules/users/tests/integration/repository.test.ts` — Integration test suite for `userRepository`, exercising the full CRUD surface and the token-facing methods (`tokenRemoveAll`, `tokenRemoveExpired`) against an in-memory MongoDB instance. It verifies repository behavior end-to-end (including Mongoose pre-save hooks, lean queries, and pagination options) without requiring a real database.
- `src/modules/users/tests/integration/schema-contract.test.ts` — Integration tests that verify Mongoose schema-level guarantees (field visibility via `select: false`, password hashing, JSON serialization shape, and the unique email index) by running against a real MongoDB instance. These test Mongoose's own built-in behaviours rather than application-level transforms, so a mocked model would be meaningless.
- `src/modules/users/tests/integration/service-oauth.test.ts` — Integration tests for `userService.findByOAuthIdentity`, the first lookup `account/services/oauth.ts` runs on every OAuth callback. The file exists as a regression guard for bug **B24**: the method previously matched on the `oauthAccounts` link alone, so a deactivated or soft-deleted account still resolved and walked straight into a session. These tests assert the lookup is now filtered the same way `findForLogin` already is.
- `src/modules/users/tests/integration/service-tokens.test.ts` — Integration tests covering the two token-facing lookups on the users service — `findByEmail` and `consumeToken`. They verify that tokens are returned as a populated array (not `undefined`), that consumption removes exactly the targeted token, that removal is persisted to the database, and that unknown tokens are a safe no-op.
- `src/modules/users/tests/integration/service.test.ts` — Integration test suite for `userService` (validation, search, create, update, delete) running against an in-memory MongoDB via `setupTestDb`. It verifies end-to-end service behaviour — validation rules, query filters, pagination, audit emission, event dispatch, erasure-registry callbacks, and access-role assignment — without hitting a real database or filesystem.
- `src/modules/users/tests/unit/factories.test.ts` — Unit tests for the `makeUser` fixture builder and the shared password vocabulary constants. Ensures the factory produces valid, insertable user objects with correct defaults/overrides, and that each password constant fulfills its designated role (settable, legacy, minimal, weak) against the _real_ Zod policy and the bundled breach list.
- `src/modules/users/tests/unit/routes.test.ts` — Unit tests that verify the user-administration router (`@modules/users/routes`) is mounted correctly: the exact endpoint set and order, per-endpoint authorization guard ordering, cache-header semantics, and upload-middleware attachment. The file exists to catch regressions where a route is added without the identity guard + key assertion, mounted above the shared `router.use(getAuth, isAuthOrCredential)` gate, or accidentally exposed to public or shared-cache paths.
- `src/modules/users/tests/unit/schema-contract.test.ts` — Unit tests that pin down the security-critical contract of `userSchema`: which fields are required, how `password`/`tokens`/`oauthAccounts` are hidden from accidental reads and serialization, what defaults a new user receives, the exact index set and uniqueness invariants, and that the `pre('save')` bcrypt hook fires only when `password` is actually modified.
- `src/modules/users/tests/unit/token-methods.test.ts` — Unit tests for the `tokenAdd` and `tokenRemoveAll` instance methods on the user schema. These two methods are where a session is created or destroyed; the tests verify the database-first write order, the in-memory mirror (only when the `tokens` array was loaded), expiry semantics, and that unrelated token types are unaffected. The model is a double—no database is needed.
- `src/modules/users/tests/unit/validation-messages.test.ts` — Guards against a specific i18n ordering bug: if `t()` is called at module scope before `i18next.init()`, Zod falls back to its built-in English messages. This test asserts the **exact shipped strings** (not merely "not a dotted key") to catch that silent fallback, and verifies the schema's thunk-based message resolution follows live locale changes without a rebuild.
- `src/modules/users/tests/unit/validation.test.ts` — Exercises the ten message thunks in `zodUserSchema` at **parse time**, which is the only moment they actually run. Because a Zod schema is a declaration, import-time coverage reports 100 % whether or not a thunk ever fires; this file closes that gap. It also pins the distinction between `error: t('…')` (resolves at import, before `i18next.init()`, silently falling back to English) and the correct `error: () => t('…')`, and guards against a message being attached to the wrong rule.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
