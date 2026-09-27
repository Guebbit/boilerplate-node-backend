---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/users/
files: 33
updated: 2026-09-27T16:22:51.816361+00:00
---

# src/modules/users/

## Purpose

The `users` module owns the **User** document and all admin-facing operations against it: listing, searching, creating, updating, soft-deleting, restoring, and stripping second-factor credentials. It is the data-and-policy half of the authentication boundary; the *flow* half (login, registration, 2FA verification, sessions, rate-limiting, anti-automation) lives in the sibling `account` module. External code interacts with this module exclusively through its barrel export (`index.ts`), and its public surface is governed by `openapi.yaml`.

## Key parts

- **Domain data** — `model.ts` defines the Mongoose schema (user fields, token sub-documents, 2FA records, OAuth links), the pre-save bcrypt hook, `select: false` guards on every credential field, and the `hashToken` / `isLiveRefreshSession` helpers other modules call. `repository.ts` wraps the shared `createRepository` factory and adds the token, credential, and inactivity-sweep queries; it is the only sanctioned place to re-select hidden fields.

- **Business logic** — `service.ts` implements admin CRUD, search, validation, audit/event emission, and the read paths that `account` calls (auth lookup, token consumption, OAuth-identity resolution). It enforces only what the user document itself requires; HTTP concerns stay in the controllers.

- **HTTP layer** — `routes.ts` mounts the admin-only `/users` router with per-endpoint auth, cache, rate-limit, and upload middleware. The `controllers/` directory contains one thin adapter per action (create, get, list/search, update, delete, restore, 2FA-removal); each maps the request to a service call and shapes the response.

- **Cross-cutting declarations** — `events.ts`, `audit.ts`, and `analytics.ts` register this module's vocabulary into the kernel's shared `DomainEventMap`, `AuditActionMap`, and `AnalyticsEventMap` via TypeScript declaration merging, giving every emitter a single typed source. `erasure-registry.ts` receives its personal-data erase hook at boot (supplied by `module.ts`) so that GDPR erasure cascades into the user record.

- **Module manifest** — `module.ts` is the single `AppModule` object the kernel reads to wire routes, permissions, locales, image writeback targets, personal-data export sections, and required configuration.

- **API contract** — `openapi.yaml` (3.0.3) is the source of truth for request/response shapes and is consumed by codegen, SDKs, and docs tooling.

- **Fixtures & tests** — `factories.ts` builds schema-accurate seed documents. `tests/` is organised into unit (schema contract, validation thunks, routes, token methods, factories), integration (model, repository, service, OAuth lookup, tokens, schema), and contract (API-level, verifying no `additionalProperties: false` field ever leaks) suites.

## How it connects

- **`src/modules/account/`** — the shared-kernel counterpart. `account` services call `userService` for `findForLogin`, `findByOAuthIdentity`, `consumeToken`, and inactivity sweeps; in return, `account` handles sessions, email delivery, rate-limiting, and anti-automation. The two modules share the user document but never import each other's internals—only the kernel-mediated barrel.

- **`src/kernel/`** — provides `DomainEventMap`, `AuditActionMap`, `AppModule` types, the `createRepository` factory, and the event bus that `service.ts` publishes into. Declaration merging in `events.ts` / `audit.ts` / `analytics.ts` grows those maps without a central enumeration.

- **`src/modules/audit-logs/`** — consumes the audit action constants this module registers; the audit-logs module is responsible for persisting and querying the events that `service.ts` emits.

- **`src/infrastructure/http/`** — supplies the routing, middleware (auth, caching, rate-limit, upload), and response-shaping utilities that `routes.ts` and the controllers rely on.

- **`src/infrastructure/adapters/`** — provides the MongoDB/Mongoose connection and query utilities that `repository.ts` builds on.

- **Other sibling modules** (`orders`, `payments`, `products`, `wishlist`, `addresses`, `cart`, `delivery`, `api-keys`, `webhooks`, `observability`) — appear in the dependency graph as consumers of the user document (e.g., order ownership) or as participants in the personal-data erasure registry that `erasure-registry.ts` fulfils at boot.

## Where to start

1. **`model.ts`** — Read this first to understand the shape of the User document, which fields are hidden by default, how password hashing is wired, and what `tokenAdd` / `tokenRemoveAll` do. Every other file in the module is built around these invariants.

2. **`service.ts`** — Next, trace `create`, `updateById`, `search`, and `findByOAuthIdentity` to see the validation rules, audit/event emission, and the exact contract that `account` depends on. Together these two files give you the full data-and-policy picture before you touch any HTTP or test code.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_users["src/modules/users/"]
    m_scenarios["scenarios/<br/>26 files"]
    m_scripts["scripts/<br/>67 files"]
    m_src["src/<br/>19 files"]
    m_src_infrastructure["src/infrastructure/<br/>44 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>23 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>19 files"]
    m_src_kernel["src/kernel/<br/>11 files"]
    m_src_modules["src/modules/<br/>15 files"]
    m_src_modules_account["src/modules/account/<br/>68 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>34 files"]
    m_src_modules_account_services["src/modules/account/services/<br/>11 files"]
    m_src_modules_addresses["src/modules/addresses/<br/>17 files"]
    m_src_modules_api_keys["src/modules/api-keys/<br/>18 files"]
    m_src_modules_audit_logs["src/modules/audit-logs/<br/>14 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_users --- m_scenarios
    m_src_modules_users --- m_scripts
    m_src_modules_users --- m_src
    m_src_modules_users --- m_src_infrastructure
    m_src_modules_users --- m_src_infrastructure_adapters
    m_src_modules_users --- m_src_infrastructure_http
    m_src_modules_users --- m_src_kernel
    m_src_modules_users --- m_src_modules
    m_src_modules_users --- m_src_modules_account
    m_src_modules_users --- m_src_modules_account_controllers
    m_src_modules_users --- m_src_modules_account_services
    m_src_modules_users --- m_src_modules_addresses
    m_src_modules_users --- m_src_modules_api_keys
    m_src_modules_users --- m_src_modules_audit_logs
    m_src_modules_users --- m_src_modules_cart
    style m_src_modules_users stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_scripts|scripts/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_kernel|src/kernel/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] · [[boilerplate-node-backend_src_modules_account_services|src/modules/account/services/]] · [[boilerplate-node-backend_src_modules_addresses|src/modules/addresses/]] · [[boilerplate-node-backend_src_modules_api-keys|src/modules/api-keys/]] · [[boilerplate-node-backend_src_modules_audit-logs|src/modules/audit-logs/]] · … and 10 more

## Files
- `src/modules/users/analytics.ts` — Declares the analytics event names for the user module's administrative actions and registers them into the app-wide `AnalyticsEventMap` type so that emitters (e.g. `service.ts`) can reference them in a type-safe, stringly-typed-free way. The events distinguish operator-initiated account actions from the self-signup path (`USER_SIGNED_UP`) so that dashboards can sum or split them independently.
- `src/modules/users/audit.ts` — Declares the audit action string constants owned by the users module and registers them into the app-wide `AuditActionMap` type via TypeScript declaration merging. It exists so that every audit event the users module emits uses a single, typed vocabulary, and so downstream consumers (query UIs, compliance exports) can filter by these exact action names.
- `src/modules/users/controllers/create-user.ts` — Handles the `POST /users` endpoint (staff-initiated user creation). It parses the incoming request (JSON or multipart), validates the payload via the users service, delegates persistence to `userService.create`, and shapes the HTTP response. The update half of this controller pair lives in `update-user.ts`.
- `src/modules/users/controllers/delete-user-two-factor.ts` — Thin HTTP adapter for `DELETE /users/:id/2fa` — the admin-assisted path that strips a user's second factor without requiring a verification code. All business logic lives in the service; this file only maps the request to a service call and the result to an HTTP response.
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
- `src/modules/users/repository.ts` — Persistence layer for the user collection. Wraps the shared `createRepository` factory with standard CRUD, then layers on the credential, token, OAuth-link, and inactivity-sweep operations that the `account` module needs across the shared-kernel edge. All sensitive fields (`password`, `tokens`, 2FA material, `oauthAccounts`, `pendingEmail`) are `select: false` on the schema; this file is the single sanctioned place to re-select them.
- `src/modules/users/routes.ts` — Defines the Express `Router` for the admin-only `/users` API surface (search, list, read, create, update, delete, restore, 2FA removal). It wires each endpoint to the appropriate authorization key, caching policy, rate-limit, upload, and route-flag middleware, then delegates to the per-action controllers.
- `src/modules/users/service.ts` — Admin-facing CRUD and search for the User document, plus the named identity operations (`account` calls for authenticate, register, verify, 2FA) and the inactivity reaper's read paths. This file enforces only what the user document itself requires; HTTP flows, sessions, emails, rate limits, and anti-automation live in `account`. It is the "users" end of the repo's shared-kernel relationship (`docs/theory/strategic-ddd.md` §5).
- `src/modules/users/tests/contract/api.contract.test.ts` — Contract tests for the `/users` and `/account` endpoints. Because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, these tests verify that **no** undeclared field (password, tokens, a bcrypt hash) can leak into any user response — not just the ones a developer thought to name. They also pin endpoint-specific behavior: cache headers, HTTP status codes for error cases, PUT replace-vs-PATCH merge semantics, and password-provisioning rules on admin create.
- `src/modules/users/tests/factories.ts` — Test-only database factory for the `users` module. It wraps the plain-payload builder in `../factories` with a persistence step (`userRepository.create`) and role assignment, giving integration and contract tests a single `createUser` / `createAdminUser` entry point that returns a live Mongoose document. It also centralises the full password vocabulary (minimal, legacy, weak, replacement) so policy tests and flow tests share the same fixtures.
- `src/modules/users/tests/integration/model.test.ts` — Integration test that verifies two invariants of the user model: (1) email addresses are stored and looked up case-insensitively via a unique index, and (2) credential fields (`password`, `tokens`) can never leak into a serialised response. The second invariant is checked at two independent layers — Mongoose `select: false` at the query level and the `toJSON` allowlist at the serialisation boundary — including `.lean()` results that bypass `toJSON` entirely.
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
