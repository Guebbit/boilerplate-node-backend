---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/shop-tasks/
files: 33
updated: 2026-11-15T00:35:03.912661+00:00
---

# src/modules/shop-tasks/

## Purpose

The shop-tasks module is the shop-side helpdesk: it listens to domain events emitted by cart, delivery, inventory, orders, payments, returns, stock-alerts, and wishlist modules, and reacts by opening or closing shop to-do tasks, writing buyer-facing inbox messages or staff work notices, and sending scheduled daily/weekly staff digest emails. It also exposes a single read endpoint that returns per-screen work counts for staff navigation badges.

## Key parts

- **Domain layer** (`domain/`) — Pure-data factories (`openings.ts`) that translate a shop event into the initial facts of a task (kind, link, permission set, due date, staff text). No side effects; the service layer handles persistence and dedup.
- **Service handlers** (`services/`) — One file per event-to-action mapping: `tasks.ts` (event → task open/close), `notices.ts` (event → notification rows), `delayed.ts` (combined task + notice for fulfillment delays), `outcome-unknown.ts` (idempotency crash recovery), `digest.ts` (scheduled summary + email), `work-summary.ts` (badge counts). `services/index.ts` aggregates them into a single `shopTasksService` object.
- **Module wiring** (`module.ts`, `module.yaml`, `routes.ts`, `jobs.ts`, `config.ts`, `staff-routing.ts`) — `module.ts` subscribes to every upstream event and mounts the one HTTP route; `module.yaml` is the declarative manifest for the dependency graph; `routes.ts` guards the endpoint with user-scoped auth; `jobs.ts` declares the daily/weekly digest schedules; `config.ts` holds the time thresholds that define "actionable" in the digest; `staff-routing.ts` is a static table mapping each notice code to its audience, email urgency, and severity.
- **Contract fragments** (`openapi.yaml`, `openapi.tasks.yaml`, `openapi.notifications.yaml`, `asyncapi.notifications.yaml`) — OpenAPI/AsyncAPI fragments that extend shared base contracts with shop-specific task kinds, link types, notification variants, and stream payloads via the `x-extends` mechanism.
- **Content builder** (`emails.ts`) — Pure function that assembles the digest email body from summary rows; never sends anything itself.
- **Tests** (`tests/`) — Unit tests for the pure domain and routing tables; integration tests that drive real registered modules through the event bus (task lifecycle, notifications, digest, erasure, outcome-unknown); and a contract test for the summary endpoint.

## How it connects

- **Upstream domain modules** (cart, delivery, inventory, orders, payments, returns, products/wishlist): shop-tasks is a pure event *consumer*. Each module emits a domain event (e.g. `fulfillment_order.delayed`, a stock restock, a return request) and shop-tasks maps it to a task, a notification, or both. No other module imports shop-tasks directly; the only public surface is the barrel in `index.ts`.
- **`tasks` module**: provides the task engine (persistence, dedup, replay, staff-closes-first rules). shop-tasks translates events into `SystemOpening` objects and delegates all storage concerns to `taskService`.
- **`notifications` module**: handles the actual writing, capping, and live-push of every buyer and staff message. shop-tasks builds the payload rows; `notificationsService.notifyStaff` / `notifyBuyer` executes the write.
- **`users` module**: supplies the permission-set and role context used by `work-summary.ts` to filter badge counts and by `staff-routing.ts` to select notification audiences.
- **Infrastructure / adapters**: the two scheduled digest jobs run through the shared job runner; the outcome-unknown sink and mail transport are provided by the infrastructure layer.

## Where to start

1. **`module.ts`** — the single file that shows every event subscription, the one route mount, the job registration, and the idempotency sink in one place. Reading it top-to-bottom gives the full "what happens when" map of the module.
2. **`domain/openings.ts`** — pure, side-effect-free factories. Each function takes a shop event and returns a `SystemOpening` literal; no database, no async, no imports beyond types. It is the fastest way to understand the module's core translation logic before touching the service or test layers.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_shop_tasks["src/modules/shop-tasks/"]
    m_src["src/<br/>42 files"]
    m_src_infrastructure["src/infrastructure/<br/>132 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>35 files"]
    m_src_modules["src/modules/<br/>199 files"]
    m_src_modules_cart["src/modules/cart/<br/>75 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>67 files"]
    m_src_modules_delivery_services["src/modules/delivery/services/<br/>32 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>61 files"]
    m_src_modules_notifications["src/modules/notifications/<br/>37 files"]
    m_src_modules_orders["src/modules/orders/<br/>139 files"]
    m_src_modules_payments["src/modules/payments/<br/>109 files"]
    m_src_modules_products["src/modules/products/<br/>73 files"]
    m_src_modules_returns["src/modules/returns/<br/>88 files"]
    m_src_modules_tasks["src/modules/tasks/<br/>63 files"]
    m_src_modules_users["src/modules/users/<br/>85 files"]
    m_src_modules_shop_tasks --- m_src
    m_src_modules_shop_tasks --- m_src_infrastructure
    m_src_modules_shop_tasks --- m_src_infrastructure_adapters
    m_src_modules_shop_tasks --- m_src_modules
    m_src_modules_shop_tasks --- m_src_modules_cart
    m_src_modules_shop_tasks --- m_src_modules_delivery
    m_src_modules_shop_tasks --- m_src_modules_delivery_services
    m_src_modules_shop_tasks --- m_src_modules_inventory
    m_src_modules_shop_tasks --- m_src_modules_notifications
    m_src_modules_shop_tasks --- m_src_modules_orders
    m_src_modules_shop_tasks --- m_src_modules_payments
    m_src_modules_shop_tasks --- m_src_modules_products
    m_src_modules_shop_tasks --- m_src_modules_returns
    m_src_modules_shop_tasks --- m_src_modules_tasks
    m_src_modules_shop_tasks --- m_src_modules_users
    style m_src_modules_shop_tasks stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules|src/modules/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] · [[boilerplate-node-backend_src_modules_delivery_services|src/modules/delivery/services/]] · [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] · [[boilerplate-node-backend_src_modules_notifications|src/modules/notifications/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] · [[boilerplate-node-backend_src_modules_products|src/modules/products/]] · [[boilerplate-node-backend_src_modules_returns|src/modules/returns/]] · [[boilerplate-node-backend_src_modules_tasks|src/modules/tasks/]] · … and 1 more

## Files
- `src/modules/shop-tasks/asyncapi.notifications.yaml` — An AsyncAPI **fragment** (not a standalone document) that extends the shared `notifications` stream with 19 shop-specific payload variants — buyer messages and staff work notices. The bundler merges it into the stream's `NotificationPayload` union via `x-extends`; it only participates in the contract while the `shop-tasks` module exists.
- `src/modules/shop-tasks/config.ts` — Declares the configuration schema for the shop-tasks module's staff digest timing thresholds. Each knob controls how long a given workflow stage (transfer, hold, return, unshipped, tracking, undelivered) must elapse before the daily digest counts it as actionable.
- `src/modules/shop-tasks/controllers/get-shop-work-summary.ts` — Thin HTTP controller that handles `GET /shop-tasks/summary`. It retrieves aggregate work counts (used for staff navigation badges) from the `workSummary` service and returns them as a JSON success response. All business logic lives in the service; this file only bridges the request to the response.
- `src/modules/shop-tasks/domain/index.ts` — Barrel (re-export) file for the **domain layer** of the shop-tasks module. It exists to give consumers a single import path (`…/domain`) for all domain-level pure-data types without needing to know the individual filenames inside the layer.
- `src/modules/shop-tasks/domain/openings.ts` — Pure-data factories that translate a shop event (payment, stock, or delivery) into the first facts of a task — the `ShopOpening`. Each function maps one situation to a kind, a link to the relevant record, the permission set that works it, the staff-facing text, and a due date. The service layer (`tasks`) is responsible for dedup keys and persistence; this file only produces the data.
- `src/modules/shop-tasks/emails.ts` — Builds the content of the daily staff-digest email: one line per summary that appeared or grew, each carrying a localized label and a link to the corresponding frontend page. The file is a pure content-builder — it produces an `EmailContent` object but never sends anything.
- `src/modules/shop-tasks/index.ts` — Public barrel for the shop-tasks module. It is the **only** import surface available to sibling modules (per the rule in `docs/theory/strategic-ddd.md` §5). Because the module owns no domain event of its own, the barrel simply re-exports the openings rules, the service, and the digest e-mail.
- `src/modules/shop-tasks/jobs.ts` — Declares the two scheduled jobs the `shop-tasks` module owns — the **daily** and **weekly** staff digest. Each job is a thin `JobDeclaration` that delegates execution to the shared `runStaffDigest` service and sets a fixed lease TTL.
- `src/modules/shop-tasks/module.ts` — Module manifest for the **shop-tasks** module — the shop-side of the helpdesk. It subscribes to domain events emitted by cart, delivery, inventory, orders, payments, returns, stock-alerts, and wishlist modules, wiring each to a service handler that opens/closes a to-do, writes a buyer or staff notification, or both. It also mounts the single staff route (`GET /shop-tasks/summary`), registers the staff digest jobs, and installs the idempotency outcome-unknown sink. No other module imports this file; it is a pure event consumer.
- `src/modules/shop-tasks/module.yaml` — Declarative manifest for the **shop-tasks** module: it names the module's role (the shop's helpdesk side — opening to-dos, writing buyer/staff messages, sending the staff digest), lists every module it depends on, and registers two scheduled sweep jobs. It exists so the runtime and the dependency graph can discover what this module subscribes to and when it fires.
- `src/modules/shop-tasks/openapi.notifications.yaml` — OpenAPI 3.1.0 contract fragment that extends the base `Notification` schema with 20 shop-specific notification variants (7 buyer-facing, 13 staff-facing). It uses the `x-extends` mechanism to append each variant to the base `oneOf` / `discriminator.mapping`, so a project without a shop module simply never sees these types.
- `src/modules/shop-tasks/openapi.tasks.yaml` — OpenAPI contract fragment that extends the shared tasks contract with shop-specific values. It does not define a standalone API; instead it appends entries to the `TaskKind`, `TaskLinkType`, and `TaskCategory` enums declared in `../tasks/openapi.yaml` via the `x-extends` custom extension, so that a project with the shop module gets a richer task vocabulary while a shop-less project keeps only the base values (`contact`, `account_review`, `export_failed`).
- `src/modules/shop-tasks/openapi.yaml` — OpenAPI 3.1.0 contract for the `shop-tasks` module. It defines the single API endpoint (`GET /shop-tasks/summary`) that returns per-screen work counts for staff navigation badges, along with the response schema and security requirements. It exists so the contract is explicit, versionable, and independent of the TypeScript implementation.
- `src/modules/shop-tasks/routes.ts` — Express route table for the shop-tasks module. It exposes a single read-only endpoint (`GET /summary`) that returns per-staff work counts used to drive navigation badges in the shop UI. Every count is resolved as the calling user; API-key auth is deliberately excluded because it would silently widen the orders scope.
- `src/modules/shop-tasks/services/delayed.ts` — Event handler for the `fulfillment_order.delayed` domain event. It combines two side effects—opening a consent-reminder to-do and writing a buyer notice—into a single handler, running the to-do first. The file exists so that one module maps to one event handler per the project's event-dispatch convention.
- `src/modules/shop-tasks/services/digest.ts` — Implements the staff digest: a scheduled (daily or weekly) pass that reads pending-work counts from each domain module, upserts or clears a per-staff summary notification, and—when a count appeared or grew—sends a single digest email. The design is idempotent; a re-run produces the same counts and emails nothing new.
- `src/modules/shop-tasks/services/index.ts` — Barrel aggregation for the shop-tasks service. It collects the event handlers defined across six sibling service files into a single `shopTasksService` object so that `module.ts` (and the module barrel) has one import to subscribe to, rather than importing each handler individually.
- `src/modules/shop-tasks/services/notices.ts` — Maps each shop-related domain event to the notification rows that should be written: a buyer-facing inbox message (parcel lost, preorder delayed, stock restocked, cart/wishlist line removed) or a work notice for the staff who can act (purchase hold, return request). Each handler is a pure payload-to-rows mapping; the actual writing, capping, and live push are delegated to `notificationsService`.
- `src/modules/shop-tasks/services/outcome-unknown.ts` — Registers the sink the idempotency middleware calls when a do-not-retry write (refund, ship, receive-stock, adjust-stock) started but never reported back. It resolves the stuck key's subject to a human-readable name and sends a one-time staff notification so the people who own that work can investigate.
- `src/modules/shop-tasks/services/tasks.ts` — Maps domain events (payment, inventory, shipment, fulfillment) to concrete shop tasks. It decides *which* event opens or clears *which* task and *which* staff screen the task links to. The actual persistence and dedup live in the tasks engine (`taskService`); this file is purely the event-to-situation translation layer.
- `src/modules/shop-tasks/services/work-summary.ts` — Provides the open-work counts that populate the staff navigation badges in the shop-tasks module. Each count is fetched through the owning domain module's own list service using the caller's context, so a badge number and the screen it points to can never disagree. The only export is `workSummary`, which returns a `ShopWorkSummary` object containing only the badges the caller is permitted to see.
- `src/modules/shop-tasks/staff-routing.ts` — Static routing table for shop-task staff notifications: for each work-notice code, it declares which permission-set holders receive it, whether it triggers an email (`now` / `digest` / `none`), and its severity. The data is passed by value to `notificationsService.notifyStaff` on each call; the notifications module stores no persistent copy.
- `src/modules/shop-tasks/tests/contract/api.contract.test.ts` — Contract tests for the `GET /shop-tasks/summary` endpoint. Verifies that the response satisfies the shared contract for both an administrator and a restricted role (`warehouse`), and that the response carries a `no-store` cache-control directive so it is never held in a shared cache.
- `src/modules/shop-tasks/tests/integration/delayed.test.ts` — Integration test that pins the `fulfillment_order.delayed` event contract: a single emission must both open a `consent_due` task for the buyer **and** write a notification, and a redelivery of the same `eventId` after a failed notice must re-run a no-op task open while delivering the notice exactly once. It guards the "task-first, notice-second" ordering that makes the handler safe under outbox redelivery.
- `src/modules/shop-tasks/tests/integration/digest.test.ts` — Integration test for the staff daily digest job (`runStaffDigest`). It exercises the full pipeline — real modules registered, real orders/returns/shipments in the test database, real notification bell — while stubbing only the mailer. Proves who receives which summary row, that a re-run neither duplicates the bell row nor re-mails, that a zero count removes the row, and that only overdue (mailed) summaries enqueue an email.
- `src/modules/shop-tasks/tests/integration/erasure.test.ts` — Integration test verifying that when a person's account is erased, shop to-do tasks that reference their orders are **retained** (the record outlives the account) while the pointer to the person (`subjectId`) is detached. It ensures the erasure path does not delete order-linked tasks.
- `src/modules/shop-tasks/tests/integration/notices.test.ts` — Integration tests that verify which notifications land in a buyer's inbox for each shop-task event (product deletion, cart merge refusal, stock-alert fulfillment, preorder delay, order hold, shipment loss). The tests drive the system exactly as production does—real modules registered, real service calls at one end, inbox assertions at the other—so the subscription wiring in `shop-tasks/module.ts` itself is under test rather than bypassed.
- `src/modules/shop-tasks/tests/integration/outcome-unknown.test.ts` — Integration test (real HTTP via supertest) that verifies the "outcome unknown" path for every do-not-retry write operation: after the first attempt commits but its idempotency record is stuck in-flight (simulating a crash before the done-mark), a retry must return `409 IDEMPOTENCY_OUTCOME_UNKNOWN` without re-executing the write, notify staff exactly once (bell + mail), and all subsequent retries must replay the stored answer. One case is generated per do-not-retry operation, so a new operation lacking a notice mapping will fail here.
- `src/modules/shop-tasks/tests/integration/staff-notices.test.ts` — Integration test that verifies the shop-tasks module routes staff notices correctly through the full pipeline: a domain event is emitted, the registered modules react, and the right people see an in-app notification and receive a locale-aware email. It intentionally uses the real module registry, event bus, and notifications service (only the mailer is mocked) to prove that role-based audience selection, "can-act" gating, idempotency, and mail routing all work end-to-end.
- `src/modules/shop-tasks/tests/integration/tasks.test.ts` — Integration test suite that drives the shop-task lifecycle exactly as production does: real modules are registered, domain events are emitted (with outbox-stamped `eventId`s), and the test reads tasks back from a live test database. It pins which events open which task kind/route/set/screen, which events close them, how due dates are computed (provider deadlines, agreed + 30 days, keep-earlier rule), how the delay jurisdiction rule follows the shop's legal country, and that the correct staff receive bell and mail notifications. Engine-internal rules (dedup, replays, staff-closes-first) are covered in a separate `tasks` unit test.
- `src/modules/shop-tasks/tests/integration/work-summary.test.ts` — Integration test for `GET /shop-tasks/summary`. Verifies that each summary count matches the total returned by the corresponding list endpoint, that role-based rules restrict which keys a caller receives, that counts update when an order changes state, and that a zero count is sent as the number `0` rather than omitted.
- `src/modules/shop-tasks/tests/unit/openings.test.ts` — Unit tests for the pure domain-opening functions in `src/modules/shop-tasks/domain/openings.ts`. Each test case asserts the shape of a `SystemOpening` (kind, route set, link, due date, message) returned for a given shop situation. No mocks or database access—every assertion is against literal expected values or derived dates.
- `src/modules/shop-tasks/tests/unit/staff-routing.test.ts` — Unit tests for the shop's staff-notification routing: verifies that every declared route names real permission sets, that the ten summary codes link to the correct frontend pages, that notice/digest emails render fully translated (no leaked template keys, no raw `@` characters), and that email urgency is assigned only where staff must act immediately.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
