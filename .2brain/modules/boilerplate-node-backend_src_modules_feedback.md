---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/feedback/
files: 28
updated: 2026-10-01T14:27:29.027097+00:00
---

# src/modules/feedback/

## Purpose

The feedback module implements the site's public contact form and the admin triage workflow behind it. It owns the full lifecycle of a `FeedbackRequest` ticket — anonymous submission, operator notification, status triage, and hard deletion — as a self-contained DDD bounded context. Because submitters have no account, records store a stranger's email address and free text, which drives the module's stricter audit and rate-limiting posture.

## Key parts

- **Domain & model** — `model.ts` (Mongoose schema, indexes, serialization transform), `domain/lifecycle.ts` (status state machine), `domain/index.ts` (shared domain types). These define *what* a feedback ticket is and how it can transition.
- **Service & repository** — `service.ts` owns all business rules (normalisation, spam detection, `respondedAt` semantics, atomic persist-then-notify). `repository.ts` is a thin `createRepository` instantiation that shields the service from persistence details.
- **HTTP surface** — `routes.ts` mounts one public route above an auth gate so everything below is admin-only. The four controllers in `controllers/` (post-contact, get/search, update-status, delete) are deliberately thin, delegating to the service via shared controller factories.
- **Module wiring & cross-cutting concerns** — `module.ts` registers routes, permissions, rate-limit budgets, data-export hook, and locale path into `AppModule`. `audit.ts` augments the app-wide `AuditActionMap`. `rate-limits.ts` declares three budgets and builds Express middleware. `emails.ts` renders the operator notification. `config.ts` holds module-level constants. `index.ts` is the sole public barrel (enforced by the strategic-DDD import rule).
- **Contract & tests** — `openapi.yaml` is the API contract; `tests/` covers unit (schema, emails, rate-limit numerics, router structure), integration (service invariants, rate-limit wiring, model serialization), and contract (OpenAPI conformance per route) tiers.

## How it connects

- **`src/infrastructure/http/`** supplies the shared Express utilities the controllers rely on: the `createSearchController`, `createUpdateController`, and `createDeleteController` factories, plus the `buildRateLimiter` middleware builder used by `rate-limits.ts`. The feedback module never reimplements HTTP plumbing.
- **`src/infrastructure/adapters/`** provides the Mongoose adapter that `model.ts` and `repository.ts` persist through. The feedback module defines *what* to store; the adapter layer handles *how* it reaches MongoDB.
- **`src/`** (shared application layer) hosts the `AppModule` contract that `module.ts` registers into, the app-wide `AuditActionMap` that `audit.ts` augments, and the shared `createRepository` factory that `repository.ts` instantiates.
- **Repository root / `docs/theory/strategic-ddd.md`** defines the import rule that restricts sibling modules to importing feedback's public API exclusively through `index.ts`, preserving the module boundary.

## Where to start

1. **`src/modules/feedback/service.ts`** — reading the service first shows you the full ticket lifecycle (create → notify → search → triage → delete) and the invariants that every controller enforces, without any HTTP noise.
2. **`src/modules/feedback/routes.ts`** — the route table is short; it makes the public-vs-admin split, the positional auth gate, and the rate-limiter placement immediately visible, giving you the "map" of every endpoint before you drill into individual controllers.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_feedback["src/modules/feedback/"]
    m_src["src/<br/>48 files"]
    m_src_infrastructure["src/infrastructure/<br/>58 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>26 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>22 files"]
    m_src_modules_feedback --- m_src
    m_src_modules_feedback --- m_src_infrastructure
    m_src_modules_feedback --- m_src_infrastructure_adapters
    m_src_modules_feedback --- m_src_infrastructure_http
    style m_src_modules_feedback stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]]

## Files
- `src/modules/feedback/audit.ts` — Declares the feedback module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Feedback rows carry a stranger's email address and free text, so _reads_ (not just mutations) are audit-relevant here — a data-protection concern that does not apply to, e.g., the public product catalogue.
- `src/modules/feedback/config.ts`
- `src/modules/feedback/controllers/delete-feedback.ts` — Controller for `DELETE /feedback/:id`. Permanently removes a feedback ticket via `feedbackRequestService.remove`. Hand-written rather than built on the shared `createDeleteController` factory because the feedback module has no soft-delete tier.
- `src/modules/feedback/controllers/get-feedback.ts` — Controller for the admin feedback triage queue (`GET /feedback` and `POST /feedback/search`). It validates and coerces query/pagination params, then delegates to the feedback service via the shared search-controller factory. Exists to keep the admin search surface thin and consistent with other search endpoints while enforcing that the result is per-admin (never cached).
- `src/modules/feedback/controllers/post-feedback-contact.ts` — Implements the sole public write endpoint in the feedback module — `POST /feedback/contact` — which creates a feedback ticket and (via the service) sends a support notification email. Mounted above the admin gate in `../routes` rather than exempted from it.
- `src/modules/feedback/controllers/update-feedback-status.ts` — Defines the handler pair for `PUT /feedback/:id` (full replace) and `PATCH /feedback/:id` (partial merge) — the admin-triage endpoints for changing a feedback ticket's status and notes. Both handlers are generated from the shared `createUpdateController` factory and delegate to `feedbackRequestService.updateStatusById`, which performs the audit and persistence.
- `src/modules/feedback/domain/index.ts`
- `src/modules/feedback/domain/lifecycle.ts`
- `src/modules/feedback/emails.ts` — Builds the finished email content (subject + rendered data object) for the feedback module's operator notification. Follows the same convention as `@modules/account/emails`: the caller passes a locale, the function returns a ready-to-send `EmailContent`. Emails go to the support mailbox, so they are rendered in `NODE_DEFAULT_LOCALE` and the customer's own submitted text is passed through untranslated.
- `src/modules/feedback/index.ts` — Public barrel for the `feedback` module. It is the **only** entry point sibling modules may import from (enforced by the strategic DDD import rule, `docs/theory/strategic-ddd.md §5`). It re-exports the module's public API so consumers never reach into internal files directly.
- `src/modules/feedback/model.ts` — Defines the Mongoose schema, document type, and model for the `FeedbackRequest` collection. It bridges the API-generated `FeedbackRequest` type (ISO-string dates) with Mongoose's native `Date` fields, wires up the indexes the feedback admin UI relies on, and exposes a serialization transform so lean query results can be shaped the same as hydrated documents.
- `src/modules/feedback/module.ts` — Module manifest for the **feedback** (contact-form) module. It registers the module's routes, permissions, rate-limit budgets, personal-data export hook, and locale path into the app's `AppModule` contract. The form is deliberately open to people with no account, so records store an email address rather than a user ID.
- `src/modules/feedback/openapi.yaml` — OpenAPI 3.0.3 contract for the feedback module (v2.0.0). Defines the REST surface for user-submitted contact requests and the admin CRUD/triage workflow over them. Serves as the single source of truth for endpoint shapes, shared error semantics, and schema references consumed by the module's implementation and any generated client code.
- `src/modules/feedback/presenter.ts`
- `src/modules/feedback/rate-limits.ts` — Defines the rate-limit budgets that govern the feedback contact form (`POST /feedback/contact`). It declares three `RateLimitBudget` configurations—keyed by client address, submitted email, and address block—and converts them into Express middleware via `buildRateLimiter`. This isolates the feedback module's limits so they are tunable, auditable, and independently testable from the middleware infrastructure.
- `src/modules/feedback/repository.ts` — Declares `feedbackRequestRepository`, the CRUD access layer for feedback requests. It is a thin instantiation of the shared `createRepository` factory, wired to the feedback domain model and a search spec. The file exists so the service layer can query and persist feedback documents without touching the persistence infrastructure directly.
- `src/modules/feedback/routes.ts` — Defines the Express route table for the feedback/contact module. It exposes exactly one public endpoint (the visitor contact form) and a set of admin-only endpoints for reading, updating, and deleting submitted feedback. Security is enforced positionally: the public route is mounted above a shared auth gate, so everything below it is automatically admin-gated without per-route repetition.
- `src/modules/feedback/service.ts` — Business-logic service for the feedback (contact-request) module. It owns the full lifecycle of a feedback ticket — creation with operator notification, paginated search, status/notes triage, hard deletion, and a caller-scoped data export — and is the single place where the "one event" of a customer reaching out (persist + notify) stays atomic. Controllers above it handle HTTP concerns; the repository below handles persistence.
- `src/modules/feedback/tests/contract/api.contract.test.ts` — Contract tests for every `/feedback` route, asserting that both success and error responses conform to the OpenAPI spec (`toSatisfyApiSpec()`). Covers the single public write endpoint (`POST /feedback/contact`), two admin-only read/search endpoints (`GET /feedback`, `POST /feedback/search`), and two admin mutation endpoints (`PUT`/`PATCH /feedback/{id}`). Also guards that the public response leaks no admin fields and that admin routes reject unauthenticated callers.
- `src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts` — Integration test for the identity-keyed dimension of the contact-form rate limiter (`contactLimiters`). It verifies that the submitted-email budget (`NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX`) is enforced independently of the per-address budget, and that the limiter is actually wired into the `POST /feedback/contact` route. The per-address-only case is covered in `submission-rate-limit.test.ts`.
- `src/modules/feedback/tests/integration/model.test.ts` — Integration test that enforces the serialization contract for feedback requests: the internal MongoDB fields `_id` and `__v` must never appear in a consumer-facing payload, whether the data arrives as a hydrated Mongoose document (`toJSON`) or as a `.lean()` list mapped through the service layer.
- `src/modules/feedback/tests/integration/schema-contract.test.ts` — Schema contract tests for the feedback-request Mongoose schema. Unlike sibling transform specs, this file asserts what Mongoose itself enforces at the schema level (serialization shape, defaults, required fields, `select: false`). It runs against a real MongoDB because a mocked model would only restate the mock's assumptions about Mongoose semantics.
- `src/modules/feedback/tests/integration/service.test.ts` — Integration test suite for the feedback request service (`create`, `search`, `updateStatus`, `remove`). Runs against a real test database to pin service-level invariants: input normalisation (lowercase email, trimmed fields, blank name → `undefined`), honeypot and disposable-email spam detection, `respondedAt` stamp-once semantics, pagination meta coherence, and status narrowing via `toFeedbackStatus`.
- `src/modules/feedback/tests/integration/submission-rate-limit.test.ts` — Integration test for `submissionLimiter` that verifies the contact-form budget is consumed by **every** request (success or failure) and that each 429 refusal is logged. It guards the regression where someone accidentally mounts `credentialLimiters` (which use `skipSuccessfulRequests`) on `POST /feedback/contact`, where every abusive submission returns `201` and would therefore spend zero of the budget.
- `src/modules/feedback/tests/unit/emails.test.ts` — Unit tests for the `contactRequestEmail` function — the notification email sent to an OPERATOR (not a customer) when a contact request / ticket is submitted. The suite pins down subject construction, data pass-through, name fallback, field labeling, and locale translation so that regressions in any of those behaviors are caught at the function boundary.
- `src/modules/feedback/tests/unit/rate-limits.test.ts` — Unit tests that pin the _numerical relationships_ between the contact-form rate-limit budgets declared in the feedback module. They assert that per-identity and per-address budgets stay well below the global browsing budget, and that the address-block budget exceeds the per-address budget it widens. The file explicitly does **not** exercise the middleware at runtime; that concern is delegated to the integration tests.
- `src/modules/feedback/tests/unit/routes.test.ts` — Pins the structural contract of the feedback router: exactly which routes exist, their order, and the middleware/guard chain attached to each. The tests are deliberately **positional** because the auth gate (`router.use(getAuth, …)`) is mounted by position, not by name—so asserting "this route has a guard" alone would pass even if the gate were mis-ordered. This file exists so a refactor that silently moves the gate, drops a limiter, or reorders routes fails immediately.
- `src/modules/feedback/tests/unit/schema-contract.test.ts` — Pins the social contract of `feedbackRequestSchema` — the one surface where an anonymous stranger writes to the database. It asserts which fields are required, which are optional, which carry defaults, which are indexed, and how long documents are retained, so that a schema refactor cannot silently change what a reporter must provide or how the operator queue behaves.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
