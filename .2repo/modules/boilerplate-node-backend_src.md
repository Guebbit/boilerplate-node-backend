---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/
files: 22
updated: 2026-09-02T18:31:26.911362+00:00
---

# src/

## Purpose

`src/` is the application orchestration layer: it owns the process entry point, wires infrastructure (tracing, database, cache, queue, i18n) into a single Express app, mounts all middleware and domain routes in their load-bearing order, and exposes the kernel contracts (auth ports, shared authorization rules, the module registry) that let individual domain modules plug in without importing each other.

## Key parts

- **Process entry & lifecycle** — `cluster.ts` (the `main` entry; runs the app under Node's cluster module or falls back to a single process) and `app.ts` (constructs the Express app, initialises OTel, wires infra, registers the module registry, mounts everything, and owns start/stop).
- **Middleware & route assembly** — `security.ts`, `request-context.ts`, `telemetry.ts`, `static-assets.ts`, `error-handling.ts`, `system-routes.ts`, and `routes.ts`. Together they define the ordered pipeline (trust-proxy → rate-limit → body-parser → request-id → access-log → locale → auth middleware → domain routers → 404 → error handler) in a single, inspectable stack.
- **Kernel** (`kernel/`) — the set of ports and shared rules that keep the app tier free of concrete module imports: `authentication.ts` (token-resolution port), `authorization.ts` (shared admin/row-level rule), `events.ts` (in-process event bus), `middlewares/authorizations.ts` (authn/authz/step-up Express guards), `registry.ts` (the `AppModule` manifest type and boot-time registration), `seed-accounts.ts` (demo account constants).
- **Module list** — `modules.ts` enumerates which domain modules this build serves; it is the single add/remove point.
- **Workers** — `workers.ts` decides which queue consumers this build drains and wires each to its handler.
- **Types** (`types/`) — a barrel (`index.ts`) re-exporting generated AsyncAPI types, generated API models, and the hand-written `AuthContext`/`Caller` DTOs behind a single `@types` import.
- **Ambient declarations** — `globals.d.ts` augments Express's `Request` so handlers see middleware-attached fields without per-file imports.
- **Demo** — `app/demo.ts` exposes two unauthenticated routes (reseed DB, read captured emails) used by the frontend e2e suite when `NODE_DEMO=true`.

## How it connects

- **`src/modules/*`** — each domain module (orders, payments, products, users, etc.) self-declares its `basePath`, router, seeds, subscriptions, and required env vars through the `AppModule` manifest. `app.ts` iterates the list from `modules.ts` and calls the kernel registry to mount them; the modules never import the app tier.
- **`src/modules/account/`** — fulfils the `kernel/authentication.ts` port at boot via `registerAuthResolver`, supplying the concrete token-parsing and user lookup that the kernel only *declares*.
- **`src/infrastructure/` and `src/infrastructure/adapters/`** — provide the concrete DB, cache, queue, and email/PDF worker adapters that `app.ts` instantiates and `workers.ts` wires to the queue adapter. The kernel ports remain abstract; the infrastructure layer supplies the "how."
- **`db/`** — houses Mongoose schemas and connection configuration consumed by the database adapter wired in `app.ts`.
- **`scripts/`** — build and demo scripts that ultimately invoke `src/cluster.ts` (via `npm run demo` or production start).
- **`tests/` and `tests/cross-cutting/`** — exercise the assembled application (middleware order, auth flows, inter-module events) against the contract defined here.

## Where to start

Read **`src/cluster.ts`** first (15 lines) to see the literal entry point and the "OTel before everything" constraint, then **`src/app.ts`** for the full wiring sequence: infrastructure init → module registry → middleware stack → route mounting → start/stop. Together they answer "what happens when the process boots and what order does everything land in," which is the mental model you need before diving into any single domain module.

## Connected modules
```mermaid
flowchart LR
    m_src["src/"]
    m_root["/ (repository root)<br/>46 files"]
    m_db["db/<br/>22 files"]
    m_scripts["scripts/<br/>25 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules["src/modules/<br/>20 files"]
    m_src_modules_account["src/modules/account/<br/>28 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>26 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>21 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_locales["src/modules/locales/<br/>32 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>21 files"]
    m_src --- m_root
    m_src --- m_db
    m_src --- m_scripts
    m_src --- m_src_infrastructure
    m_src --- m_src_infrastructure_adapters
    m_src --- m_src_modules
    m_src --- m_src_modules_account
    m_src --- m_src_modules_account_controllers
    m_src --- m_src_modules_cart
    m_src --- m_src_modules_delivery
    m_src --- m_src_modules_feedback
    m_src --- m_src_modules_inventory
    m_src --- m_src_modules_locales
    m_src --- m_src_modules_orders
    m_src --- m_src_modules_orders_tests
    style m_src stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_db|db/]] · [[boilerplate-node-backend_scripts|scripts/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] · … and 7 more

## Files
- `src/app.ts` — The process entry point. It constructs the Express application, wires all infrastructure (tracing, database, cache, queue, i18n), registers the module registry, mounts the full middleware/route stack in its load-bearing order, and owns the start/stop lifecycle. The file's primary structural constraint is that OTel must initialize before any module it instruments is imported.
- `src/app/demo.ts` — Control surface for the demo profile, mounted exclusively when `NODE_DEMO=true` (via `npm run demo`). Exposes two unauthenticated Express routes used by the paired frontend's e2e suite: one to reseed the in-memory database from module fixtures and clear the email outbox, and one to read back captured "sent" emails.
- `src/app/error-handling.ts` — Global error handling for the Express application. It defines the last-resort error handler that catches any failure no route or middleware handled, and it registers `process.on` handlers for unhandled rejections and uncaught exceptions. Both answer the same question — "what happens to a failure nobody else handled?" — at the request level and the process level respectively.
- `src/app/request-context.ts` — Installs the per-request context middleware (request-id, access log, locale) on an Express application. It exists as a single grouped install step because every downstream route depends on the values these middlewares attach to `req`, and the internal ordering is load-bearing: the request id must be generated before the access logger records it.
- `src/app/routes.ts` — Single-entry-point function that mounts all domain routers (driven by module manifests) plus the non-domain system routes and a 404 catch-all onto an Express app. It exists so that adding a new domain never requires touching this file—modules self-declare their `basePath` and router.
- `src/app/security.ts` — Installs the application's transport-level security stack (secure headers, strict CORS, body-size-bounded parsing, and rate limiting) onto an Express instance in a specific order. It exists as a single, ordered call-site so the dependency between `trust proxy`, the rate limiter's IP keying, and body-parser availability is visible in one place.
- `src/app/static-assets.ts` — Installs an `express.static` middleware that serves uploaded images and other public assets from a configurable directory. It centralises the caching and security headers for those files in one place rather than delegating to a reverse proxy, so the guarantees are testable within the app itself.
- `src/app/system-routes.ts` — Defines system-level HTTP routes that concern the process itself rather than any domain module. Currently it exposes only the root ping endpoint, serving as a liveness check that the API is up. It lives outside `src/modules` because it has no business-logic owner.
- `src/app/telemetry.ts` — Installs a single Express middleware that records per-request latency and in-flight request counts as Prometheus metrics. It exists to provide observability into request duration and concurrency without requiring instrumentation at every route handler.
- `src/app/workers.ts` — Assembly-time registration of all queue consumers for this build. It decides *which* queues the application drains and wires each to its handler, acting as the single startup hook that connects `infrastructure` workers (email, PDF, image) to the `queue` adapter. It exists because the choice of queues is a per-build decision that belongs at the application layer, not inside any individual worker.
- `src/cluster.ts` — Entry-point wrapper (set as `"main"` in `package.json`) that either runs the app under Node's `cluster` module with crash-recovery and coordinated shutdown logic, or falls back to directly loading `app.ts` when clustering is disabled. It also ensures OpenTelemetry tracing is initialized before any other module is evaluated.
- `src/globals.d.ts` — Ambient module declaration that augments Express's `Request` interface so every handler automatically sees the fields middleware attaches (auth, locale, request id, image storage metadata) without needing an explicit import at each call site.
- `src/kernel/authentication.ts` — Declares the authentication **port** for the kernel: a pair of token-resolution functions and the user shape they return. The kernel defines *what* resolution must produce; the `account` module supplies *how* at boot via `registerAuthResolver`. This separation keeps the kernel free of any concrete token-parsing or storage dependency and lets a build that omits `account` simply have no auth rather than a half-wired stub.
- `src/kernel/authorization.ts` — Provides a single, shared row-level authorization rule used by four domains (orders, payments, products, locales): an admin sees all rows, everyone else sees a narrowed slice. It centralizes the "admin is unrestricted" check so the per-domain narrowing logic is expressed only once, eliminating the silent drift that occurs when the same admin-bypass logic is copy-pasted into each service.
- `src/kernel/events.ts` — A minimal in-process domain event bus that lets modules communicate without importing each other, preserving the acyclic dependency graph enforced by `.dependency-cruiser.cjs`. It is explicitly *not* a durable broker: no persistence, no retry, no replay.
- `src/kernel/middlewares/authorizations.ts` — Express middleware guards that sit in front of module routes to enforce authentication, authorization, and step-up (re-authentication) policies. Built on the token resolvers in `kernel/authentication.ts`, they populate `request.authContext`, gate routes by role, and challenge callers whose session is too old or missing a required auth method. Every denial is audited before the response is sent.
- `src/kernel/registry.ts` — Defines the `AppModule` manifest type and the boot-time registration functions that turn the static list in `src/modules.ts` into a running application. It is the single place where the app tier learns what each module needs (routes, subscriptions, seeds, image writebacks, required env vars) without importing any individual module, keeping the kernel free of `src/modules/*` dependencies.
- `src/kernel/seed-accounts.ts` — Declares the identity and login credentials of the two demo accounts (admin and regular user) as module-level constants. It lives in the kernel rather than `src/modules/users` because multiple modules need to reference these accounts by ID, while only the `users` module owns the actual record. The file exists so the frontend's e2e login flow and every demo-data module can share a single, fixed source of truth for who the demo people are.
- `src/modules.ts` — Central registry that enumerates which domain modules this build serves. It is the single point where a module is added (a new folder under `src/modules/` plus one import/entry) or removed (delete the entry and `rm -rf` the folder). All consumers that need the full module list import `enabledModules` from here rather than hard-coding paths.
- `src/types/asyncapi.generated.ts` — Auto-generated TypeScript type definitions and channel-name constants derived from `asyncapi.yaml`. It gives the rest of the codebase compile-time access to message payload shapes (observability metrics, email/PDF jobs) and canonical channel identifiers without hand-maintaining them.
- `src/types/auth-context.ts` — Defines the two auth-related type contracts that sit between the HTTP/auth layer and domain logic: `AuthContext` (the full resolved caller DTO attached to a request) and `Caller` (the minimal, permission-relevant subset an authorization rule may read). Its job is to let controllers, middleware, and service signatures depend on a plain interface instead of `UserDocument`, keeping the Mongoose schema internal.
- `src/types/index.ts` — Type barrel that consolidates three sources of public types—generated API models, generated AsyncAPI types, and a hand-written auth-context DTO—behind a single import path (`@types`). Consumers never need to know which file a type actually originates from.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
