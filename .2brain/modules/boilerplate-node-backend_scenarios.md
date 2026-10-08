---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: scenarios/
files: 42
updated: 2026-10-07T23:52:41.470796+00:00
---

# scenarios/

## Purpose

The `scenarios/` module owns every named, whole-database seed state the repository can build (currently `shop` and `blank`) and the infrastructure needed to execute them. It seeds the demo/test MongoDB, drives the real application over HTTP to produce internally-consistent order history, and provides the ephemeral runtime (in-process `mongod`, fake payment/mail/OAuth doubles, controllable clock) so the demo profile and e2e suite run without external services.

## Key parts

- **Entry points & registry** — `run-server.ts` boots the demo profile; `apply.ts` is the CLI seeder; `index.ts` is the single registry that maps scenario names to their `buildScenario` functions and re-exports the `shopModules` table.
- **Seed data definitions** — `accounts.ts` (fixed IDs, credentials, roles for every seed account), `users.ts` (assembles user documents), `products.ts` + `products-filler.ts` (named edge-case products + 126-row deterministic catalogue), `addresses.ts`, `locales.ts` (five pinned locale states + i18n strings).
- **Flow-driven seeding** — `flows/shop-history.ts` places, pays, ships, and cancels orders through real HTTP endpoints so audit trails, stock movements, and analytics events are produced by application code; `flows/actions.ts`, `flows/client.ts`, `flows/backdate.ts`, `flows/loopback.ts` provide the HTTP wrapper, auth handling, date spreading, and ephemeral-port plumbing that flow steps share.
- **Runtime support & doubles** — `support/ephemeral-mongo.ts` + `support/ephemeral-mongod.ts` resolve and start an in-process MongoDB; `support/doubles/` (payments, mail, OAuth, webhook sink) replace external integrations; `support/demo-clock.ts` and `support/no-human-challenge.ts` give the demo controllable time and a clean sign-in path.
- **Scheduling & validation** — `waves.ts` (dependency-wave scheduler for seed steps), `shop-modules.ts` (per-module fixture table with ordering), `check.ts` (verifies scenario guarantees match seeded rows), `seed.ts` (insert-if-absent primitive).
- **Tooling** — `tools/generate-seed-images.ts` produces byte-identical catalogue images and manifests; `rate-limits.ts` relaxes anti-automation limits for scripted callers; `jobs.ts` exposes on-demand background-job triggers; `subjects.ts` provides import-free ID constants for build-time scripts.

## How it connects

- **`src/modules/*`** — Each module's `AppModule.scenario` declaration is the contract that `shop-modules.ts` orders and `check.ts` validates. Scenario code calls module repositories/services to write fixtures, and the flow runner exercises every module's HTTP surface (orders, payments, delivery, inventory, accounts, addresses, cart, locales, products, users, wishlist, webhooks, example).
- **`src/infrastructure/` (adapters, http)** — `run-server.ts` and `apply.ts` boot the full middleware stack and HTTP listener in-process; the flow client talks to those endpoints.
- **`scripts/` & `scripts/contracts/`** — `subjects.ts` exists so `scripts/contracts/client-collections-bundle.ts` can reference pinned row IDs without importing the generated `@api/` client; `jobs.ts` mirrors the same production service calls that `scripts/ops/` invokes.
- **`src/` (application root)** — `src/app/demo.ts` imports the `shop` scenario's `buildScenario` and the cached `shop-history` result; `scenarios/` in turn imports the application's config, adapters, and module code to seed through real repositories.

## Where to start

1. **`scenarios/index.ts`** — the registry. Reading it shows the full set of scenarios, the single `buildScenario` signature, and the `shopModules` export, giving you the map before you follow any individual file.
2. **`scenarios/accounts.ts`** — every seed persona, their ObjectId, email, and role lives here. Once you know "who is who," the data files (`users.ts`, `products.ts`, `addresses.ts`) and the flow code become self-explanatory.

## Connected modules
```mermaid
flowchart LR
    m_scenarios["scenarios/"]
    m_scripts["scripts/<br/>66 files"]
    m_scripts_contracts["scripts/contracts/<br/>18 files"]
    m_src["src/<br/>34 files"]
    m_src_infrastructure["src/infrastructure/<br/>67 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>32 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules["src/modules/<br/>32 files"]
    m_src_modules_account["src/modules/account/<br/>107 files"]
    m_src_modules_addresses["src/modules/addresses/<br/>24 files"]
    m_src_modules_cart["src/modules/cart/<br/>56 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>27 files"]
    m_src_modules_example["src/modules/example/<br/>39 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>37 files"]
    m_src_modules_locales["src/modules/locales/<br/>44 files"]
    m_src_modules_orders["src/modules/orders/<br/>91 files"]
    m_scenarios --- m_scripts
    m_scenarios --- m_scripts_contracts
    m_scenarios --- m_src
    m_scenarios --- m_src_infrastructure
    m_scenarios --- m_src_infrastructure_adapters
    m_scenarios --- m_src_infrastructure_http
    m_scenarios --- m_src_modules
    m_scenarios --- m_src_modules_account
    m_scenarios --- m_src_modules_addresses
    m_scenarios --- m_src_modules_cart
    m_scenarios --- m_src_modules_delivery
    m_scenarios --- m_src_modules_example
    m_scenarios --- m_src_modules_inventory
    m_scenarios --- m_src_modules_locales
    m_scenarios --- m_src_modules_orders
    style m_scenarios stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scripts|scripts/]] · [[boilerplate-node-backend_scripts_contracts|scripts/contracts/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_addresses|src/modules/addresses/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_example|src/modules/example/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] · … and 6 more

## Files
- `scenarios/accounts.ts` — Single source of truth for every seed account in the demo/test environment: their fixed ObjectIds, login credentials (email + plaintext password), and the role assignments that place them into the access model. All other scenario files import IDs from here rather than hardcoding them, so changing an account's identity or credentials is a one-file edit.
- `scenarios/addresses.ts` — Seeds the demo address-book collection with two owner-scoped fixtures: a two-entry book for the admin (to make the "set as default" flow observable) and a single-entry book for the ordinary customer (to exercise the optional-`phone` path). Also exposes the seed function that `seedShop` walks.
- `scenarios/apply.ts` — CLI entry point for `npm run scenario:apply`. Boots the full application in-process (middleware stack included), validates environment safety, then delegates all data construction to the named scenario's `buildScenario` from the registry. It is the runner — it owns the connection, the gates, and the single call — not the scenario itself.
- `scenarios/blank.ts` — Defines the **blank** scenario: a minimal seed that establishes only harness infrastructure (access model, named accounts, baseline shop modules such as locales) with no catalogue, orders, or carts. It is the restore target for behaviour e2e specs that create and assert their own data, as opposed to the full `shop` scenario.
- `scenarios/check.ts` — Verifies that a scenario's declared guarantees (each module's `AppModule.scenario` entries) exactly match the subjects the scenario actually seeds (the id map from `buildScenario`). Checks both directions: a guarantee with no seeded row, and a subject no enabled module declares. Runs at test time as a tripwire and at compile time for module mounting.
- `scenarios/config.ts` — Defines the twelve `NODE_SEED_*_PASSWORD` environment variables as a typed config slice for the demo seed accounts. It exists so that seed passwords are read through the same config infrastructure as the rest of the app (giving a consistent "blank means unset" semantic and a single source for documentation), even though the seeder is a script rather than part of the application's boot path.
- `scenarios/example.ts`
- `scenarios/flows/actions.ts` — Thin HTTP wrappers for every action a person takes in a shop-history scenario. Each function hits the same endpoint a browser would call so that audit entries, actor scope, and domain events are produced through the real middleware stack (authentication, caller context, rate limiters). A direct service call would create the order but none of its trail.
- `scenarios/flows/backdate.ts` — Backdates a flow-produced order and every document the application wrote on its behalf (payment, shipment, reservation, stock movement, audit rows) into the past, so the demo shop has realistic date spread for analytics, filtering, and dashboards. Without this, every order shares the container's boot timestamp.
- `scenarios/flows/client.ts` — Thin HTTP client that scenario flows use to drive the application over a live server during container bootstrap. It wraps `fetch` with bearer-token auth, unwraps the API's `{ data, errors }` envelope once, and distinguishes "expected to succeed" calls (`call`) from "expected to possibly fail" calls (`attempt`). It exists so that every flow in `scenarios/flows/` shares one auth path, one error shape, and one `fetch` call site.
- `scenarios/flows/loopback.ts` — Provides a helper for driving the Express app over real HTTP on an ephemeral loopback port without publishing a stable port. It exists so callers (the demo-profile flow runner and `scenarios/apply.ts`) can exercise the app via unauthenticated `/__test/*` routes before or without the production server binding `NODE_PORT`, avoiding a half-built shop being visible to the frontend's readiness probe.
- `scenarios/flows/shop-history.ts` — Drives the application's HTTP endpoints (checkout, payment, shipping, cancellation, deletion) to build a realistic order history for the demo dataset — rather than inserting rows directly. Because every order is placed, paid, and shipped through real application code, the resulting payments, stock movements, reservations, shipments, audit entries, and analytics events are internally consistent and survive code changes. Runs **once per process**; `src/app/demo.ts` caches the result in memory and replays it on every subsequent restore.
- `scenarios/index.ts` — The scenario registry: the single file that defines every named, whole-database seed state this repo can build, exposes the unified `buildScenario` entry point, and re-exports the `shopModules` table. It exists so that adding a new scenario touches exactly one place, and so that `src/app/demo.ts` and `scenarios/apply.ts` can index scenarios without hand-rolled conditionals.
- `scenarios/jobs.ts` — Defines the set of background jobs the demo profile can trigger on demand via a test endpoint. Each entry wraps the same production service call that the corresponding `scripts/ops/` script makes, so the demo lever exercises the real sweep logic rather than a mock copy.
- `scenarios/locales.ts` — Defines the dynamic-locale slice of the demo dataset: five languages, each pinned to a distinct state (source/fallback, downloadable-only, answerable/overlay, draft/inactive, empty), plus sixteen translated string entries that together exercise every code path in the locale and i18n infrastructure. Also exports the single demo-history step (an operator override write) that the shop flow calls to produce audit-trail entries.
- `scenarios/products-filler.ts` — Generates a deterministic pet-supply catalogue by taking the Cartesian product of six animals, seven product types, and three quality tiers (126 rows), then appends two digital PDF guides. It is a plain nested-loop combinator with hand-picked English and Italian copy — no randomness — so the same rows appear on every boot and every restore. It exists because the repo avoids `@faker-js/faker` (ESM-only, breaks ts-jest) and a demo catalogue needs byte-for-byte reproducibility even more than a test fixture does. This file only produces words; `./products` is responsible for ids, images, and persistence.
- `scenarios/products.ts` — Defines the product catalogue's seed dataset for the demo environment: seven named products that cover the edge-case branches the storefront and repositories actually exercise (soft-deleted, out-of-stock, inactive, minimal, digital), plus 128 combinatorial filler rows that make the grid look like a real pet-supply store. Also writes per-locale translation rows for every named product. Consumed by `scenarios/apply.ts` (live DB) and integration tests (throwaway DB).
- `scenarios/rate-limits.ts` — Defines the set of rate-limit environment overrides that scripted callers (the e2e test server and the `apply` seeder) need so that hundreds of rapid, single-address requests don't trip the anti-automation ladder. Without these overrides, a rate-limit refusal on one request cascades into opaque failures (e.g. "login is broken") on subsequent ones. The file is explicitly never applied in a real deployment.
- `scenarios/run-server.ts` — Entry point for the **demo profile** (`npm run demo`): boots the real application against an in-memory MongoDB, seeds it with the `shop` scenario, and serves on `NODE_PORT` (default 3000). No Docker, Redis, or message broker — cache and queue run disabled. This is the server the paired frontend dev-server and e2e suite target instead of a hand-written mock.
- `scenarios/seed.ts` — A domain-agnostic seeding primitive that all scenario modules use to write their fixtures. It provides a minimal repository interface and two "insert if not already present" helpers so that scenario modules never duplicate the check-then-create logic.
- `scenarios/shop-modules.ts` — Declares the `shop` scenario's per-module fixture table — which collections get seeded before anyone uses the shop, their dependency ordering, whether they are also baseline for `blank`, and which entries contribute a demo-history step. It lives in its own file (not in `scenarios/index.ts`) so that `blank.ts` can read the baseline subset without creating a circular import with `index.ts`.
- `scenarios/subjects.ts` — Holds the pinned (hardcoded) IDs and credentials for seeded database rows so that consumers that **cannot import module code** — specifically `scripts/contracts/client-collections-bundle.ts`, which runs before `api/` exists — can still reference a specific row. It is import-free by construction: it must not transitively pull in anything that imports the generated `@api/` client.
- `scenarios/support/database-snapshot.ts`
- `scenarios/support/demo-clock.ts` — Installs a `Date`-only fake clock for the demo profile so that journey steps can "time travel" by advancing `Date` while all other timers (Mongo heartbeats, Node socket timeouts, `performance`) keep ticking in real time. It exists because the demo server needs controllable elapsed time for rules that read `Date.now()` / `new Date()`, without freezing the underlying I/O round-trips.
- `scenarios/support/demo.ts`
- `scenarios/support/development-doubles.ts`
- `scenarios/support/doubles/mail-log.ts`
- `scenarios/support/doubles/mail-outbox.ts`
- `scenarios/support/doubles/oauth-fake.ts`
- `scenarios/support/doubles/payments/fake.ts`
- `scenarios/support/doubles/payments/register.ts`
- `scenarios/support/doubles/register.ts`
- `scenarios/support/doubles/webhook-sink.ts`
- `scenarios/support/ephemeral-mongo.ts` — Resolves which MongoDB instance a test suite or demo should talk to. It is a pure branching/resolver module: if `NODE_TEST_MONGO_URI` is set it uses that external database; otherwise it delegates to an in-process `mongod` (via `mongodb-memory-server`). It does **not** start the server itself — that responsibility is injected by the caller, keeping the resolver's import graph free of the database driver.
- `scenarios/support/ephemeral-mongod.ts` — Starts a real, single-member `mongod` replica set in-process via `mongodb-memory-server`. It lives in `scenarios/` rather than `src/` because `mongodb-memory-server` is a devDependency and the `not-to-dev-dep` lint rule forbids `src/` from importing one. It provides the concrete "start" half of the `EphemeralMongo` contract defined in `./ephemeral-mongo.ts`.
- `scenarios/support/no-human-challenge.ts` — Provides a scoped context manager (`withoutHumanChallenge`) that temporarily sets `NODE_ANTIBOT_PROVIDER` to `none` so that a flow-runner scenario can sign in and pay over real HTTP without the antibot provider refusing the first login. The provider is read per-request, so the build can be driven under "no challenge" and the original value restored afterwards.
- `scenarios/tools/generate-seed-images.ts` — One-off script (`npm run scenario:images`) that downloads a real photo per catalogue role from Lorem Picsum, processes it through the same digest/thumbnail pipeline as production uploads, and writes the results plus two generated manifest JSONs. It exists so `public/images/seed/` contains byte-identical-to-production image output without hand-placed files or hot-linked URLs, and so the manifests consumed by the scenario fixtures are never hand-edited.
- `scenarios/tools/generate-webhook-sink-tls.ts`
- `scenarios/users.ts` — Builds the full set of demo user documents for the users collection — named role accounts, state-specific personas, staff, and a ten-person filler customer base — and exposes two seeding entry points: one for the full `apply` scenario and one (named-users only) for the `blank` scenario. All credentials and IDs are sourced from `@scenarios/accounts`; this file is responsible for assembling the documents and writing them idempotently.
- `scenarios/waves.ts` — Provides a generic dependency-wave scheduler for a named set of async steps. Each step declares which *other* steps in the same set it must wait for; the module groups them into waves that run concurrently internally and sequentially across waves. Exists so that `scenarios/shop-modules.ts` can order seeding steps (e.g., products after locales) without hand-maintained "this goes first" special cases, and so a step's dependency can be deleted without breaking the remaining set.
- `scenarios/webhooks.ts` — The webhooks module's slice of the demo dataset. Seeds a single webhook subscription pointing at a `webhook-tester` Docker service (from the `integrations` compose profile) so a developer can watch captured deliveries in a browser. It is inert by default: when `NODE_WEBHOOK_DEMO_SINK_URL` is unset, the function resolves immediately with no inserts, so no dead subscription appears in production logs.
- `scenarios/wishlist.ts` — Defines the wishlist slice of the demo seed dataset. It produces one wishlist per demo account, deliberately containing only publicly visible products, and exposes the seeding routine that `seedShop` walks to populate the wishlist collection.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
