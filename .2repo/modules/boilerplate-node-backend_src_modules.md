---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/modules/
files: 20
updated: 2026-08-31T20:51:49.295150+00:00
---

# src/modules/

## Purpose

`src/modules/` houses the application's domain modules—each a self-contained directory that owns its persistence, business logic, and public export surface. The modules listed here (`audit-logs`, `observability`) are joined by sibling modules (`account`, `cart`, `orders`) that follow the same structural convention. Together they provide the business capabilities the API exposes, while keeping internal wiring (Mongoose models, repositories, metrics) encapsulated behind a single barrel file.

## Key parts

- **`audit-logs/`** — The durable, queryable half of the audit system. `model.ts` defines the Mongoose schema and serialization transform; `repository.ts` provides append-only read/write access with a TTL index for retention; `service.ts` implements the `AuditSink` (fire-and-forget write) and the paginated search path; `module.ts` is a headless registration point that calls `registerAuditSink` at import time; `metrics.ts` owns the one Prometheus counter tracking lost entries; `index.ts` is the sole public barrel.
- **`audit-logs/tests/`** — Integration tests for the repository (search, pagination, response shaping) and unit tests pinning the schema contract, TTL configuration, and the asymmetric failure semantics of `record` (fail-open) vs. `search` (fail-closed).
- **`observability/`** — The operator-facing dashboard mounted at `/observability`. `routes.ts` defines five read-only GET endpoints, each with a distinct auth guard. Controllers handle health readiness, a structured metrics overview (resolved by metric name against the shared prom-client registry), an SSE event stream, a Prometheus scrape endpoint, and the paginated audit-log read. `module.ts` wires these routes into the kernel's app registry.
- **`observability/tests/`** — Contract tests guarding the hand-assembled JSON responses against spec drift, plus unit tests for the metrics-overview controller and the router's shape, ordering, and per-route auth selection.
- **`observability/*.yaml`** — OpenAPI 3.0.3 and AsyncAPI 2.6.0 contracts that document the five endpoints and the three SSE channels respectively; they serve as the machine-readable spec the contract tests validate against.

## How it connects

- **`src/infrastructure/`** supplies the audit pipeline (`emitAuditEvent`) that `audit-logs` plugs into via `registerAuditSink`, and the telemetry/health primitives that `observability`'s controllers read. The modules never import infrastructure internals directly—they go through the injection points established at registration time.
- **Sibling modules (`account`, `cart`, `orders`)** each own one or more Prometheus counters on the shared prom-client registry. `observability`'s metrics-overview controller resolves those counters *by name* at runtime rather than importing the sibling modules, so no compile-time coupling is created.
- **`src/modules/account/`** is referenced as the pattern exemplar: both `audit-logs/metrics.ts` and the barrel-export convention explicitly mirror `modules/account/`'s structure.
- **`tests/support/`** provides `setupTestDb` (the in-memory MongoDB instance) used by `audit-logs` integration tests.

## Where to start

1. **`src/modules/audit-logs/index.ts`** — Ten lines, one export. It tells you the module's entire public surface and, by contrast, what is deliberately hidden. Reading it alongside `module.ts` shows the registration pattern every sibling module follows.
2. **`src/modules/observability/routes.ts`** — The single file that reveals what the operator sees: five endpoints, their auth guards, and the one cross-module dependency (the audit-logs read). From there, the controllers are short and self-explanatory.

## Connected modules
```mermaid
flowchart LR
    m_src_modules["src/modules/"]
    m_root["/ (repository root)<br/>44 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules_account["src/modules/account/<br/>23 files"]
    m_src_modules_cart["src/modules/cart/<br/>37 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_tests_cross_cutting["tests/cross-cutting/<br/>28 files"]
    m_tests_support["tests/support/<br/>20 files"]
    m_src_modules --- m_root
    m_src_modules --- m_src
    m_src_modules --- m_src_infrastructure
    m_src_modules --- m_src_infrastructure_adapters
    m_src_modules --- m_src_modules_account
    m_src_modules --- m_src_modules_cart
    m_src_modules --- m_src_modules_orders
    m_src_modules --- m_tests_cross_cutting
    m_src_modules --- m_tests_support
    style m_src_modules stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] · [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] · [[boilerplate-node-backend_tests_cross-cutting|tests/cross-cutting/]] · [[boilerplate-node-backend_tests_support|tests/support/]]

## Files
- `src/modules/audit-logs/index.ts` — Public barrel (export surface) for the `audit-logs` module. It is the **only** file a sibling module is allowed to import from this directory (same convention as `modules/products/index.ts`). It exists to keep the module's internal structure (service, repository, model, types) encapsulated while still exposing the read path that `observability` needs to serve `GET /observability/audit`.
- `src/modules/audit-logs/metrics.ts` — Defines the single Prometheus counter that the audit-logs module owns, tracking how many audit entries made it into the compliance log but were lost on the path to the queryable trail. It lives in the module (not in `infrastructure/`) following the same pattern as `modules/account/metrics.ts`, so the overview endpoint can read the value without a direct import of this file.
- `src/modules/audit-logs/model.ts` — Mongoose model, schema, and serialization transform for the persisted audit-log collection. It is the durable, queryable half of the audit system: the log line (written by `@infrastructure/observability/audit`) is the compliance record, while this collection exists so `GET /observability/audit` can answer "what has actor X done" from the API. Fields use **snake_case** deliberately — the document is returned verbatim as `AuditEventItem` in `openapi.yaml` and must match the shape a SIEM ingests.
- `src/modules/audit-logs/module.ts` — Wires the audit-logs module into the application by registering its persistence sink at import time. It is a headless module (no router): its sole job is to call `registerAuditSink` so that every `emitAuditEvent` call from the observability layer is persisted. The single read endpoint (`GET /observability/audit`) lives on the dashboard side, not here.
- `src/modules/audit-logs/repository.ts` — Append-only read/write access to the audit-log collection. Deliberately exposes no update or delete path — an editable audit trail defeats the purpose — and delegates expiry to the model's TTL index rather than in-app cleanup.
- `src/modules/audit-logs/service.ts` — The audit log service that bridges the audit pipeline to persistence: it is the `AuditSink` implementation (fire-and-forget write) registered by the audit-logs module, and the paginated read path behind `GET /observability/audit`.
- `src/modules/audit-logs/tests/integration/repository.test.ts` — Integration tests for `auditLogRepository`, executed against the in-memory MongoDB that `setupTestDb` provisions. Covers entry creation, multi-filter search, the exclusive `since` boundary, pagination metadata, response shaping (stripping `_id`/`__v`, ISO-8601 timestamps), and a deep-paging regression guard for the former 200-row read cap.
- `src/modules/audit-logs/tests/unit/retention.test.ts` — Unit test verifying that the audit-log collection's TTL index is created with the correct `expireAfterSeconds` value, both when the `NODE_AUDIT_RETENTION_DAYS` environment variable is unset (default) and when it is explicitly configured.
- `src/modules/audit-logs/tests/unit/schema-contract.test.ts` — Compliance test that pins the audit-log schema's structural contract: which fields are mandatory, which enums are closed, which Mongoose options are set, and which indexes (including the TTL) exist. It treats the schema as a security artifact rather than a convenience, so that silent drift—missing fields, open-ended enums, a buffering write, or a misconfigured TTL—fails loudly instead of degrading audit coverage.
- `src/modules/audit-logs/tests/unit/service.test.ts` — Unit tests for the two functions exported by `auditLogService`. The tests focus on their deliberately asymmetric failure semantics: `record` is fail-open (must never throw, swallows rejections into a log line) and `search` is fail-closed (propagates errors to the caller). The repository is fully mocked so failure paths can be exercised deterministically.
- `src/modules/observability/asyncapi.yaml` — AsyncAPI 2.6.0 contract defining the three SSE channels served at `/observability/events` by the observability module. It is a self-validating slice that a bundler merges (servers, channels, components) into the service-wide contract; the `info` block exists only so the file can be linted and opened standalone.
- `src/modules/observability/controllers/get-observability-audit.ts` — Controller handler for `GET /observability/audit`. It provides a filtered, paged read over the `audit-logs` collection — the single point where the observability module reaches outside its own process snapshot, and the sole reason it depends on `audit-logs`.
- `src/modules/observability/controllers/get-observability-health.ts` — Handler for `GET /observability/health`. Assembles the **readiness** snapshot for this instance by pulling dependency state, telemetry-sink configuration, and process resource metrics from the `infrastructure/observability` layer, then sends a single JSON response. Readiness is deliberately distinct from liveness (`GET /`): an orchestrator acts on liveness, whereas this endpoint answers "which backing service is missing so the instance cannot fulfil its contract?"
- `src/modules/observability/controllers/get-observability-metrics-overview.ts` — Handler for `GET /observability/metrics/overview`. Aggregates HTTP, auth, business, database, and process metrics into a single structured JSON response. It resolves domain counters by metric **name** against the shared prom-client registry instead of importing them directly, so the observability module never compiles against the domains it reports on.
- `src/modules/observability/module.ts` — Module manifest that registers the operator-facing observability surface (health check, metrics overview, live SSE stream, Prometheus scrape endpoint, and audit trail) under the `/observability` base path. It exists to wire routes and locales into the kernel's app registry without owning any data itself.
- `src/modules/observability/openapi.yaml` — OpenAPI 3.0.3 contract (v2.0.0) for the observability module. It defines five endpoints that expose operational visibility — SSE event stream, health snapshot, Prometheus metrics, a JSON metrics summary, and a paginated audit log — each with its own auth model suited to the consumer (browsers, Prometheus scrapers, or admin JWTs).
- `src/modules/observability/routes.ts` — Defines the Express route table for the operator dashboard (mounted at `/observability`). It wires five read-only GET endpoints to their controllers and, per route, selects the authentication guard that matches the caller's capability — cookie-based auth for a browser `EventSource`, a static scraper credential for Prometheus, and the standard admin-JWT chain for normal API clients.
- `src/modules/observability/tests/contract/api.contract.test.ts` — Contract tests for the three JSON endpoints under `/observability` (`/health`, `/metrics/overview`, `/audit`). They exist because those response bodies are hand-assembled field-by-field (a health snapshot, a Prometheus overview, an audit page) rather than produced by a shared serializer, making them prone to silent drift from the API spec. `GET /events` (SSE) and `GET /metrics` (requires `NODE_METRICS_TOKEN`) are excluded for transport reasons, not contract gaps.
- `src/modules/observability/tests/unit/metrics-overview.test.ts` — Unit tests for the `GET /observability/metrics/overview` controller. Verifies that each domain row in the response carries real counter values resolved by metric name from the shared Prometheus registry, and that a missing counter degrades to `0` rather than crashing.
- `src/modules/observability/tests/unit/routes.test.ts` — Unit tests for the observability router and its two inline handlers (`GET /events`, `GET /metrics`). The handlers are not separately exported from `routes.ts`, so the suite drives them through the Express router stack. The file also asserts the route table's shape, ordering, and the distinct authentication guard applied to each endpoint.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
