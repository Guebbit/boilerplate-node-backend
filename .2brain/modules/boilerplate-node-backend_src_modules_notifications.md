---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/notifications/
files: 36
updated: 2026-11-08T10:52:07.230014+00:00
---

# src/modules/notifications/

## Purpose

The notifications module is the bounded context behind every user-facing "bell" and staff work notice. It stores language-agnostic notification rows (a `code` + `params`), exposes a REST + SSE API for the inbox, subscribes to domain events to produce new notices, dispatches optional courtesy emails to staff, and fulfils GDPR personal-data export/erase obligations. All persisted data is tenant- and user-scoped at the query level.

## Key parts

- **Service layer (`services/`)** — `inbox.ts` (read, write, dismiss, cap-trim, and broadcast), `staff.ts` (resolve audience, dedup-write a notice, optionally queue email), `stream.ts` (per-user SSE hub with heartbeat and permission re-check), `subscribers.ts` (domain-event → notice mapping), `index.ts` (single `notificationsService` facade).
- **HTTP layer (`routes.ts` + `controllers/`)** — Express router with per-route auth strategy; thin adapters that validate params, delegate to the service, and shape the response. The SSE controller is special: it authenticates via cookie because `EventSource` cannot send an `Authorization` header.
- **Data layer (`repository.ts`, `model.ts`)** — Mongoose schema (the single source of truth for the persisted shape and index strategy) and a repository that extends the shared CRUD factory with inbox-specific operations (dedup-aware upsert, per-audience trim, bulk delete), all scoped by `userId` in the Mongo filter.
- **Domain wiring (`module.ts`, `config.ts`, `staff-routing.ts`, `emails.ts`)** — module manifest (routes, config, event subscriptions, personal-data handlers, locale paths registered with the kernel); typed runtime limits (inbox cap, staff retention); the six foundation notice routing entries (audience, email class, link target); and the email builder that renders per-code i18n copy plus a deep link.
- **View & contracts (`presenter.ts`, `openapi.yaml`, `asyncapi.yaml`)** — presenter builds the exact wire object (no field leakage); OpenAPI 3.1 for the REST + SSE surface; AsyncAPI 3.0 for the per-user SSE channel (linted independently, merged into root contracts at build time).
- **Public barrel (`index.ts`)** — the *only* import surface for sibling modules; enforces the module boundary.
- **Tests (`tests/`)** — unit (schema contract, presenter shape, SSE hub, staff routing, route auth guards, SSE controller), integration (service inbox, staff pipeline, task alert / due-soon / overdue end-to-end), and contract (wire-shape pinning over real HTTP). `factories.ts` (excluded from barrel) and `tests/factories.ts` supply documents for seeding and assertions.

## How it connects

- **`shared/`** — `repository.ts` extends the shared `createRepository` CRUD factory; `subscribers.ts` attaches to the shared event bus.
- **`src/modules/` (kernel / module registry)** — `module.ts` registers routes, config, subscriptions, and personal-data handlers so the application can mount this module.
- **`src/modules/account/`** — the module contributes a personal-data-export section (account-data export in `openapi.yaml`) and handles GDPR collect/erase via the handlers declared in `module.ts`.
- **`src/modules/locales/`** — `emails.ts` resolves per-code i18n dictionary paths for email copy; the stored `code` + `params` are rendered by the frontend from its own locale files.
- **`src/modules/observability/`** — the SSE stream in `services/stream.ts` deliberately mirrors the observability stream pattern (plain HTTP SSE, in-process connection map, no broker, single-host deployment).
- **`src/modules/tasks/` & `src/modules/shop-tasks/`** — emit domain events (task created/assigned, due-soon sweep, overdue sweep) that `subscribers.ts` maps into inbox notices and staff emails; integration tests drive the full pipeline through `taskService`.
- **`src/modules/users/`** — `staff-routing.ts` references permission-set roles to resolve which staff members receive a notice; `staff.ts` queries user/role data when targeting an audience.
- **`src/infrastructure/` / `src/infrastructure/adapters/`** — email dispatch (via `emails.ts` / `staff.ts`) and session/cookie validation (SSE controller) rely on infrastructure adapters for transport.
- **`/` (repository root)** — the AsyncAPI bundler merges this module's `asyncapi.yaml` into the repo-root contracts at build time.

## Where to start

1. **`services/index.ts`** — the one-file facade. Reading it tells you every capability a controller or sibling module can call, without needing to open the four implementation files behind it.
2. **`model.ts`** — the Mongoose schema and typed exports. Understanding what a notification row actually stores (code, params, audience, read flag, timestamps, indexes) makes the service, repository, and presenter logic straightforward to follow.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_notifications["src/modules/notifications/"]
    m_shared["shared/<br/>47 files"]
    m_src["src/<br/>40 files"]
    m_src_infrastructure["src/infrastructure/<br/>126 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>34 files"]
    m_src_modules["src/modules/<br/>194 files"]
    m_src_modules_account["src/modules/account/<br/>157 files"]
    m_src_modules_locales["src/modules/locales/<br/>52 files"]
    m_src_modules_observability["src/modules/observability/<br/>40 files"]
    m_src_modules_shop_tasks["src/modules/shop-tasks/<br/>31 files"]
    m_src_modules_tasks["src/modules/tasks/<br/>58 files"]
    m_src_modules_users["src/modules/users/<br/>78 files"]
    m_src_modules_webhooks["src/modules/webhooks/<br/>64 files"]
    m_src_modules_notifications --- m_shared
    m_src_modules_notifications --- m_src
    m_src_modules_notifications --- m_src_infrastructure
    m_src_modules_notifications --- m_src_infrastructure_adapters
    m_src_modules_notifications --- m_src_modules
    m_src_modules_notifications --- m_src_modules_account
    m_src_modules_notifications --- m_src_modules_locales
    m_src_modules_notifications --- m_src_modules_observability
    m_src_modules_notifications --- m_src_modules_shop_tasks
    m_src_modules_notifications --- m_src_modules_tasks
    m_src_modules_notifications --- m_src_modules_users
    m_src_modules_notifications --- m_src_modules_webhooks
    style m_src_modules_notifications stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_shared|shared/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] · [[boilerplate-node-backend_src_modules_observability|src/modules/observability/]] · [[boilerplate-node-backend_src_modules_shop-tasks|src/modules/shop-tasks/]] · [[boilerplate-node-backend_src_modules_tasks|src/modules/tasks/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]] · [[boilerplate-node-backend_src_modules_webhooks|src/modules/webhooks/]]

## Files
- `src/modules/notifications/asyncapi.yaml` — Self-contained AsyncAPI 3.0.0 contract for the per-user SSE stream served at `/notifications/stream`. It is a complete document (with its own server, channels, operations, and components) so it can be linted independently (`npm run lint:asyncapi:modules`) and read standalone; a bundler merges its contents into the repo-root contracts at build time.
- `src/modules/notifications/config.ts` — Declares the runtime configuration knobs for the notifications module: how many inbox notifications a user retains, and how many staff work-notice items are kept alongside a staff member (and for how long). It exists so these limits live in one typed, validated place rather than being scattered across services.
- `src/modules/notifications/controllers/delete-notification.ts` — Thin HTTP adapter for `DELETE /notifications/:id`. Validates the path parameter, delegates to `notificationsService.remove`, and maps the result to an appropriate HTTP response (204 on success, 404 / refused / error otherwise). Exists so the route layer can stay declarative while all transport concerns live here.
- `src/modules/notifications/controllers/delete-notifications.ts` — Thin HTTP adapter that handles the `DELETE /notifications` endpoint, delegating to `notificationsService.dismissAll` to remove all of the caller's notifications (optionally scoped to a single `audience`). It exists to keep route wiring in `routes.ts` decoupled from the service layer.
- `src/modules/notifications/controllers/get-notification.ts` — Thin HTTP adapter for the `GET /notifications/:id` endpoint. It extracts the notification ID from the route param, delegates to `notificationsService.get`, and shapes the Express response. The controller contains no business logic beyond param validation and response formatting.
- `src/modules/notifications/controllers/get-notifications-stream.ts` — Controller for `GET /notifications/stream`. It validates the caller's cookie-based session (SSE via `EventSource` cannot send an `Authorization` header) and then delegates the actual Server-Sent Events streaming to `notificationsService.stream`, passing a periodic re-check callback.
- `src/modules/notifications/controllers/get-notifications.ts` — A thin HTTP adapter that exposes `GET /notifications`. It extracts the authenticated caller from the request, delegates to `notificationsService.listVisible`, and serialises the result (or an error) back to the client. Exists so the route layer stays one-liner and all HTTP concerns are isolated here.
- `src/modules/notifications/controllers/post-read-all.ts` — Thin HTTP adapter that handles `POST /notifications/read-all`. It extracts the caller's ID from the authenticated request, delegates the "mark all read" work to `notificationsService.readAll`, and returns a 204 No Content on success or a structured error on failure.
- `src/modules/notifications/emails.ts` — Builds the single email a work-notice can send to a staff member: a short "what happened" summary in the recipient's language plus a deep link to the relevant screen. Only notices whose routing specifies `email: 'now'` produce a mail; all others remain bell-only. The wording is resolved from the notice code's own i18n dictionary path so each module ships its email copy alongside its notice definitions.
- `src/modules/notifications/factories.ts` — Test and seed factory for notification documents. It centralizes the construction of a valid `Partial<NotificationDocument>` so that tests and seed scripts don't repeat boilerplate, and it is deliberately excluded from the module barrel to keep it out of production code paths.
- `src/modules/notifications/index.ts` — Public barrel (re-export surface) for the **notifications** bounded context. It is the *only* entry point a sibling module is allowed to import from, enforcing the module boundary described in `docs/theory/strategic-ddd.md` §5. Siblings that need to inform a user typically emit a domain event; those that write a notice directly or query who is staffed on a set call the service re-exported here.
- `src/modules/notifications/model.ts` — Defines the Mongoose schema and typed exports for a notification row. Each row stores a `code` and its `params` (never a rendered sentence); the frontend translates the code from its own locale files, so a stored row is language-agnostic and outlives copy changes. This file is the single source of truth for the persisted shape and the index strategy.
- `src/modules/notifications/module.ts` — Module manifest for the notifications inbox. Registers the module's HTTP routes, configuration, domain-event subscriptions, personal-data handlers, and locale/template paths with the kernel registry so the application can mount the module, react to events, and fulfil GDPR collect/erase requests.
- `src/modules/notifications/openapi.yaml` — OpenAPI 3.1.0 contract for the notifications module: the signed-in user's in-app inbox (personal notifications) and shop work notices for staff. It defines the REST endpoints, the SSE live stream, the schema variants for notification payloads, and the account-data-export section contributed by this module.
- `src/modules/notifications/presenter.ts` — View-layer for notifications. Transforms internal `NotificationDocument` objects into the exact wire shape declared in `openapi.yaml` by **building** a new object (rather than serializing the document), so any field the contract does not name can never leak through.
- `src/modules/notifications/repository.ts` — The data-access layer for notifications. It extends the shared `createRepository` CRUD factory with the specific read/write operations an inbox service needs (list, insert, dedup-aware upserts, per-audience trims, bulk deletes). Every query is scoped by `userId` in the Mongo filter itself, so cross-user access is structurally impossible rather than guarded by a separate check.
- `src/modules/notifications/routes.ts` — Defines the Express router for all notification endpoints under `/notifications`. It wires each route to its controller and attaches the correct authentication middleware per route. The file exists to keep route ordering, auth strategy, and origin checks in one place, separated from controller logic.
- `src/modules/notifications/services/inbox.ts` — The inbox service: the single place where notifications are read, written, and removed (owner delete, inbox empty, or cap trim). Every mutation is also broadcast to the owner's open streams via `publishToUser`, so multiple tabs stay in sync without a manual refresh.
- `src/modules/notifications/services/index.ts` — Barrel/facade for the notifications service layer. It aggregates the functions from `inbox`, `staff`, `stream`, and `subscribers` into a single `notificationsService` object so that controllers and sibling modules have exactly one import point, never reaching into the individual files directly.
- `src/modules/notifications/services/staff.ts` — Implements "work notices" for shop staff: resolves who must hear about an event (by permission-set role), writes a deduplicated notice row (the authoritative record), and optionally sends a courtesy email. A mail failure is logged and never propagated, because the written row is what matters.
- `src/modules/notifications/services/stream.ts` — Manages live Server-Sent Event delivery of notifications, one stream per open browser tab, scoped to a single user. It maintains an in-process `Map<string, Set<Response>>` of active connections so that a published event is written only to the sockets belonging to the affected user. It mirrors the pattern and rationale of the observability stream (plain HTTP SSE, no broker, single-host deployment).
- `src/modules/notifications/services/subscribers.ts` — Maps each domain event in the notifications domain to the staff "notice" it should produce in the inbox. Each exported function is a pure mapping from an event payload to a `notifyStaff` / `notifyStaffMember` call; the module's `subscribe()` (wired in `services/index.ts`) attaches them to the event bus. The actual persistence of notices is delegated to `./staff`. Project-specific (shop) notices do **not** live here — they call `notificationsService` directly from the module that adds them.
- `src/modules/notifications/staff-routing.ts` — Defines the routing table for the six staff work notices that ship with every project: which permission sets are told, whether the notice earns an email (and of what class), and which frontend screen it links to. It is the single reference for auditing "who is told" for foundation notices. Modules that add their own notices keep their own table and pass it in per call; this file lists none of them.
- `src/modules/notifications/tests/contract/api.contract.test.ts` — Contract tests that verify every `/notifications` route returns the correct HTTP status code and response shape, covering all branches (success, 404, 401, 422) over real HTTP. The file exists to pin the API surface so that ownership and cap logic (lived in the integration suite) never accidentally changes the wire contract. SSE (`GET /notifications/stream`) is read only as far as the single frame each test needs.
- `src/modules/notifications/tests/factories.ts` — Test-persistence layer for notifications. The in-memory BUILDER (`makeNotification`) lives in `../factories.ts`; this file wraps it with a database write so integration and contract tests can create real documents. It also exposes a simple count helper for assertions that verify *nothing* was written.
- `src/modules/notifications/tests/integration/service.test.ts` — Integration test suite for the notifications service (`notificationsService`). Validates ownership isolation, newest-first ordering, per-user inbox cap enforcement, real-time stream push on create/delete/dismiss, and audience-scoped bulk dismissal — all against a real database rather than mocks.
- `src/modules/notifications/tests/integration/staff.test.ts` — Integration tests for staff (work) notifications, exercised the same way production drives them: real modules registered, a domain event emitted at one end, and the member's notification "bell" read at the other. Verifies audience targeting (which roles/sets are told), idempotent redelivery, mail-queue routing by severity, role-scoped visibility at read time, tenant isolation, retention caps and TTL, and the shape of the data-export view.
- `src/modules/notifications/tests/integration/task-alerts.test.ts` — Integration test that verifies the full notification pipeline for task events, driving the system the way production does: real modules registered, tasks created or assigned through `taskService`, and assertions made against both the in-app notification bell and the email queue. It proves three invariants: (1) only staff in the task's work-set see a bell entry, (2) contact messages produce **no** per-person staff-notice mail (only the support mailbox gets the full message), and (3) system tasks produce per-person staff-notice mail but **never** touch the contact mailbox.
- `src/modules/notifications/tests/integration/task-due-soon.test.ts` — Integration test for the due-soon reminder pipeline. Drives a task whose deadline is two days away through `taskService.remindDueSoon()` and verifies that (1) the right people receive exactly one bell notification and one staff mail, (2) duplicate delivery of the same domain event does not produce duplicates, (3) a privacy-category task additionally mails the support address in-thread, and (4) non-privacy contact categories stay silent.
- `src/modules/notifications/tests/integration/task-overdue.test.ts` — Integration test that drives the overdue-task reminder end-to-end the same way production does: a task is created, its due date backdated, and the tasks sweep (`remindOverdue`) executed. It verifies the reminder reaches the same audience as the original opener (bell notification + email), is delivered exactly once, is suppressed for closed tasks, and falls back to the support mailbox (or to nobody) when no qualified recipient exists.
- `src/modules/notifications/tests/unit/get-notifications-stream.test.ts` — Unit tests for the `GET /notifications/stream` controller. They verify three contract points: the handler delegates the raw response, caller id, and a permission-recheck callback to the notification streamer; the recheck callback is wired to `stillSignedInViaCookie` and the original request; and a request missing either `sessionRecheck` or `authContext.id` is refused with a 401 and no stream is opened.
- `src/modules/notifications/tests/unit/presenter.test.ts` — Unit tests for the notification presenter's wire contract: verifies that `presentNotification` and `presentNotifications` emit exactly the fields the API contract names (no more, no less), with correct serialization (IDs/dates as strings, `readAt` absent when unread) and per-code param pass-through.
- `src/modules/notifications/tests/unit/routes.test.ts` — Verifies the authentication guard configuration on every route in the notifications router. It ensures standard CRUD routes require a bearer session with no permission rule, and that the SSE stream route authenticates via cookie (because `EventSource` cannot send a `Authorization` header).
- `src/modules/notifications/tests/unit/schema-contract.test.ts` — Unit test that pins the **schema contract** (field declarations, constraints, and indexes) of `notificationSchema` without exercising document-level behavior. It guards against silent drift in required fields, enum membership, defaults, index shape, and timestamp options — changes that would break the inbox read, the cap trim, or deduplication even though no single fixture goes invalid.
- `src/modules/notifications/tests/unit/staff-routing.test.ts` — Unit tests for the staff-notification routing layer. Verifies that every project notice has a route with valid permission sets, that email dispatch timing matches urgency, that generated links point to the correct staff pages, that rendered emails carry proper locale text and links, and that access-control helpers behave correctly for each role.
- `src/modules/notifications/tests/unit/stream.test.ts` — Unit tests for the per-user Server-Sent Events (SSE) notification hub. They verify the wire format, per-user routing, heartbeat behavior, teardown hygiene, and the periodic permission recheck—all by driving `streamNotifications` with a hand-built fake `Response` and fake timers so the exact bytes written to the socket are assertable.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
