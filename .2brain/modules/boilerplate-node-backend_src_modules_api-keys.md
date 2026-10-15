---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/api-keys/
files: 25
updated: 2026-10-15T13:37:43.243340+00:00
---

# src/modules/api-keys/

## Purpose

The `api-keys` module owns the full lifecycle of machine-to-machine credentials (`sk_…` API keys): minting, listing, revoking, and resolving them on every authenticated request. It exposes a small admin HTTP surface for human operators to manage keys and registers a credential resolver into the kernel's authentication pipeline so that API keys can call the API as first-class principals with a permission subset of their minter.

## Key parts

- **Credential core** — `credentials.ts` (SHA-256 hash/verify), `model.ts` (Mongoose schema enforcing hash-only persistence), `repository.ts` (query-level exclusion of revoked/expired rows), `presenter.ts` (document → wire-shape mapping).
- **Service layer** — `services/api-keys.ts` (mint / list / revoke logic, audit recording, email dispatch, bulk-revoke on account events), `services/resolver.ts` (per-request `sk_…` resolution: parse → verify → re-derive minter's *current* permissions), `services/index.ts` (stable re-export point).
- **HTTP surface** — `routes.ts` (Express router, session + permission guards), `controllers/` (list, mint, revoke handlers), `openapi.yaml` (3.1 contract the contract tests enforce).
- **Module wiring & observability** — `module.ts` (mounts routes, registers the resolver, subscribes to `sessions-revoked`, declares GDPR obligations), `index.ts` (public barrel enforcing the module boundary), `audit.ts` (typed action vocabulary), `emails.ts` (interpolated notice copy).
- **Tests** — unit tests for hashing and email copy; integration tests covering the two-phase permission boundary, event emission/relay, and outcome pinning; contract tests validating routes against `openapi.yaml`.

## How it connects

- **`src/modules/account/`** — The account module emits `sessions-revoked` (on logout-all, password reset, email-change-undo); `api-keys` subscribes and bulk-revokes that tenant's keys. Conversely, `resolver.ts` re-floors every key's effective permissions against the minter's *current* account state (active flag, role) rather than trusting the snapshot stored at mint time.
- **`src/modules/users/`** — Source of the role/permission data the resolver queries when re-deriving the minter's live permission set.
- **`src/` (kernel) / `src/infrastructure/http/`** — The kernel's authentication pipeline invokes the resolver registered in `module.ts`; the infrastructure layer provides the Express adapter and Mongoose driver that `routes.ts` and `repository.ts` build on.

## Where to start

Read **`module.ts`** first — it is the single file that shows every piece (routes, resolver registration, event subscription, GDPR config) being wired together, giving you the module's shape in one pass. Then jump to **`services/resolver.ts`** to understand the security-critical per-request path: how a raw `sk_…` token becomes a `Caller` whose permissions are the intersection of the mint-time subset and the minter's live permissions. That intersection logic is the module's core invariant.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_api_keys["src/modules/api-keys/"]
    m_src["src/<br/>35 files"]
    m_src_infrastructure["src/infrastructure/<br/>70 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>34 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules["src/modules/<br/>59 files"]
    m_src_modules_account["src/modules/account/<br/>132 files"]
    m_src_modules_cart["src/modules/cart/<br/>62 files"]
    m_src_modules_users["src/modules/users/<br/>54 files"]
    m_src_modules_api_keys --- m_src
    m_src_modules_api_keys --- m_src_infrastructure
    m_src_modules_api_keys --- m_src_infrastructure_adapters
    m_src_modules_api_keys --- m_src_infrastructure_http
    m_src_modules_api_keys --- m_src_modules
    m_src_modules_api_keys --- m_src_modules_account
    m_src_modules_api_keys --- m_src_modules_cart
    m_src_modules_api_keys --- m_src_modules_users
    style m_src_modules_api_keys stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/api-keys/audit.ts` — Declares the audit-action vocabulary for API-key credential events (mint, revoke, bulk-revoke-on-compromise) and registers it into the app-wide `AuditActionMap` type via module augmentation. This file contains no runtime logic beyond the constant declaration; its job is to give the API-key domain a typed, centrally-registered set of action identifiers that the observability layer and downstream consumers (dashboards, incident tooling) can reference.
- `src/modules/api-keys/controllers/list-api-keys.ts` — HTTP controller for `GET /api-keys`. Returns the calling tenant's API-key credentials in newest-first order, with pagination. Secrets are never included in the response.
- `src/modules/api-keys/controllers/mint-api-key.ts` — HTTP controller that handles `POST /api-keys` — the endpoint for minting a new API credential. It validates the request body, delegates to the API-keys service, and shapes the HTTP response (201 with a `Location` header on success, 422 on permission refusal).
- `src/modules/api-keys/controllers/revoke-api-key.ts` — Hand-written controller that handles `DELETE /api-keys/:id` by revoking a credential (a soft state change). It exists as a standalone function rather than being generated by the `createDeleteController` factory because revoke has no hard-delete counterpart — it is purely an idempotent state transition.
- `src/modules/api-keys/credentials.ts` — Mints and verifies API-key credentials using one-way SHA-256 hashing (`hashToken`). It deliberately avoids bcrypt/argon2 because the tokens are pure `randomBytes` output with no search space to make expensive, so the ~100 ms per-authenticated-request cost buys nothing. This is the "mint and verify" half of the credential lifecycle; storage and lifecycle management live in the services layer.
- `src/modules/api-keys/emails.ts` — Provides the resolved, human-readable copy for the two emails the API-keys module sends: a notification when a credential is minted, and a notification when credentials are revoked due to a possible compromise. Follows the same convention as `@modules/account/emails` — language is passed in as an argument, and the output is fully interpolated text ready for a template to render.
- `src/modules/api-keys/index.ts` — Barrel (public surface) for the `api-keys` module. Sibling modules are only permitted to import from this file, enforcing the module boundary defined in `docs/theory/strategic-ddd.md` §5. It re-exports the service API and the type definitions so consumers never reach into the module's internals.
- `src/modules/api-keys/model.ts` — Defines the Mongoose schema, document type, and registered model for the `apikeys` collection. It is the single source of truth for the shape of a machine-to-machine credential record and enforces the core security invariant that only a SHA-256 `hash` (never the raw secret) is persisted.
- `src/modules/api-keys/module.ts` — Module manifest for the `api-keys` module. Wires together the HTTP routes, the `sk_…` bearer-token credential resolver, a domain-event subscription that revokes keys on session-wide invalidation, and the personal-data (GDPR) obligations for the `apikeys` collection.
- `src/modules/api-keys/openapi.yaml` — OpenAPI 3.1.0 contract for the `api-keys` module. It defines the three machine-to-machine credential operations (list, mint, revoke), the request/response schemas for each, and the `x-personal-data` extension that a bundler folds into the account data export. It exists as the single source of truth for the module's external API shape.
- `src/modules/api-keys/presenter.ts` — Single-purpose mapping layer that converts a stored `ApiKeyDocument` into the `ApiKey` wire shape declared by `openapi.yaml`. It exists so that the document's schema-internal representation (with `_id`, `hash`, etc.) is isolated from the contract type, and so `mint()` in the service layer can layer a plaintext `secret` on top of the *same* shape without the secret ever being persisted on the document.
- `src/modules/api-keys/repository.ts` — Data-access layer for the `apikeys` collection. Extends the generic `createRepository` factory with six domain-specific queries that the generic CRUD cannot express—most critically the credential-resolve lookup that must exclude revoked/expired rows *at the query level* rather than relying on a downstream caller to re-check.
- `src/modules/api-keys/routes.ts` — Defines the Express router for the `/api-keys` admin surface. It wires three routes—list, mint, and revoke—behind session-only authentication and granular permission checks, ensuring that the act of issuing or revoking API keys is always a human, session-authenticated operation.
- `src/modules/api-keys/services/api-keys.ts` — Service layer for credential (API key) CRUD: listing, minting, and revoking tenant-scoped API keys. Centralises permission validation at mint time, audit recording, email notifications, and the bulk-revoke path triggered by account-level events (logout-everywhere, password reset).
- `src/modules/api-keys/services/index.ts` — Barrel (index) file for the api-keys services layer. It re-exports the CRUD functions from `api-keys.ts` under a single namespaced object and surfaces the credential resolver from `resolver.ts`, giving controllers and the module installer one stable import point.
- `src/modules/api-keys/services/resolver.ts` — Implements the `sk_...` API-key credential resolution path that the kernel's authentication system calls on every request. It parses a bearer token, verifies it against the repository, then **re-derives** the minter's current permissions from the authoritative source (rather than trusting the key's stored snapshot) and returns a `Caller` whose key set is the intersection of what the key was minted with and what the minter holds *right now*. Registered into `kernel/authentication.ts` by `module.ts` at import time.
- `src/modules/api-keys/tests/contract/api-keys.test.ts` — Contract tests for the three `/api-keys` admin routes (list, mint, revoke), verifying observable behavior against the bundled `openapi.yaml`. Every route requires a human bearer session; the API keys minted here are **not** exercised against other routes — that cross-cutting coverage lives in `tests/cross-cutting/`.
- `src/modules/api-keys/tests/integration/activity.test.ts` — Integration test that verifies resolving (i.e. "using") an API key stamps the minting account's `lastApiKeyUseAt` field. This matters because the inactivity reaper reads that timestamp; without the stamp, an account that only uses API keys would be falsely reaped as idle.
- `src/modules/api-keys/tests/integration/api-keys.test.ts` — Integration test suite that proves the two-phase permission boundary for API keys against a **real database**: (1) at mint time, a key can only carry a subset of the caller's current permissions (never step-up-tier keys); and (2) at every subsequent resolve, the key's effective permissions are re-floored against the minter's *current* state (role, active flag) rather than the snapshot captured at mint. This behavior cannot be demonstrated with mocked repositories, so the suite persists real users, assigns/revokes real roles, and calls the production `resolveCredential` path.
- `src/modules/api-keys/tests/integration/outcomes.test.ts` — Integration test suite that pins the *outcomes* of the API-keys credential service: what it returns (listing order, 404/422 refusals with exact error wording), what it audits (action, target, metadata), and what it mails (template, locale, greeting). It deliberately excludes permission-subset rules (owned by `api-keys.test.ts`) and HTTP-level contracts, instead asserting the same invariants at the service-function boundary.
- `src/modules/api-keys/tests/integration/revoked-by-account.test.ts` — Integration test proving that the `account` module actually emits the `sessions-revoked` event at the points where a security epoch moves (logout-all, password reset, email-change-undo), and that this revokes previously minted API keys. It is the complement to `api-keys.test.ts`, which covers the event *handling*; this file covers the event *emission*.
- `src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts` — Integration test proving that the `account.sessions-revoked` event is committed transactionally alongside the credential write and then delivered to the `api-keys` consumer via the outbox relay. It verifies at-least-once semantics: a failing consumer leaves the row pending, the relay retries, and a redelivery does not double-revoke. Driven over HTTP (login, reset-confirm, logout-all) to mirror real production traffic.
- `src/modules/api-keys/tests/unit/credentials.test.ts` — Unit tests for the one-way hashing half of the API-key credential lifecycle: minting, parsing, verifying, and formatting. Each test exercises a single exported function from `credentials.ts` in isolation, covering both happy paths and rejection/edge cases.
- `src/modules/api-keys/tests/unit/emails.test.ts` — Unit tests that verify both API-key notice emails (minted and revoked) carry a complete, correctly-worded payload in the recipient's language, and that the revoked notice names the specific event that triggered the revocation.
- `src/modules/api-keys/tests/unit/schema-contract.test.ts` — Contract tests that lock down the *declarative* metadata of `apiKeySchema` (required fields, index definitions, index options, timestamps). These assertions catch regressions that valid-document integration tests cannot: a silently dropped `required`, a lost `unique` on `publicPrefix`, or an extra index appearing.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
