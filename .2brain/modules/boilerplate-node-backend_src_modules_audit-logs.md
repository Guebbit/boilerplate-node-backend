---
tags:
  - 2brain
  - 2brain/module
  - project/boilerplate-node-backend
type: module
module: src/modules/audit-logs/
files: 14
updated: 2026-09-27T16:19:18.670952+00:00
---

# src/modules/audit-logs/

## Purpose

The audit-logs module is the durable, queryable half of the platform's audit pipeline. It defines the schema and TTL for persisted action-history entries, provides an append-only repository, and exposes a single tenant-facing `GET /audit` endpoint. It also acts as the persistence sink that the infrastructure audit-logger writes into whenever an actor event is emitted. By design it is write-once, read-many: no update or delete operations exist at the type level.

## Key parts

- **Domain core** — `model.ts` (Mongoose schema, indexes, TTL, serialization), `repository.ts` (append-and-read only; `create`, `search`, `since` helper), `service.ts` (persistence sink with fail-open `record` and fail-closed `search`; applies scope, sort, and pagination policies shared by both read surfaces).
- **HTTP surface** — `routes.ts` (Express router, credential-type validation, `audit.any.read` permission gate), `controllers/get-audit.ts` (the single handler behind `GET /audit`), `openapi.yaml` (module-local OpenAPI contract for code-gen and consumer tooling).
- **Module wiring** — `module.ts` (manifest: identity, routes, locales, permissions, personal-data hook; `onRegistered` hook that connects `emitAuditEvent` to this module's collection), `index.ts` (barrel export enforcing DDD encapsulation).
- **Operational signal** — `metrics.ts` (Prometheus counter tracking entries that reached the compliance log but failed to persist into the queryable trail).
- **Tests** — grouped into `tests/unit/` (retention TTL, schema contract, service failure-mode contracts), `tests/integration/` (repository against in-memory Mongo), and `tests/contract/` (wire-level shape of `GET /audit`).

## How it connects

- **`src/modules/observability/`** — The strongest coupling. The observability module's audit logger (in `@infrastructure/observability/audit`) decides *what* to record and calls into this module's `service.record`. Conversely, `getObservabilityAuditLogs` in the observability module queries the same collection through the same `auditLogService`, differing only in that it authenticates with a platform key rather than a tenant key.
- **`src/infrastructure/`** — Hosts the audit-logger that emits events into this module's sink; the module's `onRegistered` hook in `module.ts` is the join point.
- **`src/kernel/`** — Provides the module-registration lifecycle and the DDD encapsulation rules that `index.ts` enforces (sibling modules must import through the barrel, not reach into `service.ts` or `model.ts`).
- **`src/modules/users/`** — Supplies the tenant/user context that scopes `GET /audit` to "the tenant's own entries" and underpins the `audit.any.read` permission check.
- **`src/infrastructure/http/`** — Express-level plumbing (middleware chain, router mounting) that `routes.ts` plugs into.
- **Repository root / `scenarios/`** — The root defines `NODE_AUDIT_RETENTION_DAYS` (consumed by the TTL index in `model.ts`); `scenarios/` provides end-to-end fixtures exercised by the contract and integration tests.

## Where to start

Read `module.ts` first — in one file you see the module's name, base path, routes, permission, the personal-data hook, and the `onRegistered` wiring that connects the event stream to the collection. Then read `service.ts` to understand the two asymmetric contracts (fail-open write, fail-closed read) and how the single service backs both the tenant endpoint and the observability endpoint. Together those two files explain roughly 80 % of what the module does.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_audit_logs["src/modules/audit-logs/"]
    m_scenarios["scenarios/<br/>26 files"]
    m_src["src/<br/>19 files"]
    m_src_infrastructure["src/infrastructure/<br/>44 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>23 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>19 files"]
    m_src_kernel["src/kernel/<br/>11 files"]
    m_src_modules_observability["src/modules/observability/<br/>30 files"]
    m_src_modules_users["src/modules/users/<br/>33 files"]
    m_src_modules_audit_logs --- m_scenarios
    m_src_modules_audit_logs --- m_src
    m_src_modules_audit_logs --- m_src_infrastructure
    m_src_modules_audit_logs --- m_src_infrastructure_adapters
    m_src_modules_audit_logs --- m_src_infrastructure_http
    m_src_modules_audit_logs --- m_src_kernel
    m_src_modules_audit_logs --- m_src_modules_observability
    m_src_modules_audit_logs --- m_src_modules_users
    style m_src_modules_audit_logs stroke-width:3px
```

[[boilerplate-node-backend_ROOT|/ (repository root)]] · [[boilerplate-node-backend_scenarios|scenarios/]] · [[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] · [[boilerplate-node-backend_src_kernel|src/kernel/]] · [[boilerplate-node-backend_src_modules_observability|src/modules/observability/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/audit-logs/controllers/get-audit.ts` — Single-export controller that handles `GET /audit`, returning a filtered, paginated list of the tenant's own action-history entries. It mirrors the read path used by the `observability` module's `getObservabilityAuditLogs`, differing only in authentication scope (tenant key vs. platform key) — both ultimately query the same collection via `auditLogService`.
- `src/modules/audit-logs/index.ts` — Public barrel (single import surface) for the audit-logs module. Sibling modules must import only through this file rather than reaching into `service.ts` or `model.ts` directly, enforcing the strategic DDD encapsulation rule.
- `src/modules/audit-logs/metrics.ts` — Defines the domain-owned Prometheus counter for the audit-logs module. The counter tracks audit entries that made it into the compliance log but failed to persist into the queryable trail, giving operators a signal for the deliberate fail-open path in `record()`.
- `src/modules/audit-logs/model.ts` — Mongoose schema, model, and serialization transform for the persisted audit-log collection. It is the durable half of the audit pipeline: the logger in `@infrastructure/observability/audit` decides *what* to record, and this file defines the shape, indexes, TTL, and read-path serialization so `GET /observability/audit` can answer "what has actor X done" from the API.
- `src/modules/audit-logs/module.ts` — Module manifest for the read-only audit trail. It declares the module's identity (name, base path, routes, locales, permissions, personal-data hook) and, via its `onRegistered` hook, wires the persistence sink so that `emitAuditEvent` calls flow into this module's collection. The module provides two read surfaces: `GET /audit` (own shop, gated on `audit.any.read`) and, through the observability module, `GET /observability/audit` (platform-wide).
- `src/modules/audit-logs/openapi.yaml` — OpenAPI 3.0.3 contract for the **audit-logs** module. It declares the single `GET /audit` endpoint (shop-scoped, role-gated action history) and the component schemas that endpoint—and the shared `POST /account/export` route—reference. It exists so consumers and code-gen tools have a machine-readable, module-local contract without reaching into another module's spec.
- `src/modules/audit-logs/repository.ts` — Append-and-read repository for audit log entries. It exposes only `create` and `search` (plus a `since` scope helper), deliberately omitting update and delete to enforce immutability at the type level. Record expiry is delegated to a Mongo TTL index defined on the model, not handled here.
- `src/modules/audit-logs/routes.ts` — Defines the Express router for the tenant-facing `GET /audit` endpoint. It exposes a shop's own action history, restricted to roles that hold the `audit.any.read` permission (a tenant key, not a platform-operator key). The file exists to wire authentication, credential-type validation, and permission gating in front of the single audit-reading controller.
- `src/modules/audit-logs/service.ts` — The audit-log service. It is the persistence sink that the observability audit module calls when an entry is emitted, and the read path behind two HTTP endpoints: `GET /observability/audit` (platform operator) and `GET /audit` (tenant staff, gated on `audit.any.read`). It sits between the domain model/repository and the controllers, applying collection-specific policies (scope, sort, pagination) that don't belong in the generic repository.
- `src/modules/audit-logs/tests/contract/audit.test.ts` — Contract tests for the single route this module exposes — `GET /audit`. Covers authentication, role-based authorization, query-parameter filtering, and response-shape validation against the API spec. Exists to lock the observable behavior of the endpoint so refactors inside the module cannot silently change the wire contract.
- `src/modules/audit-logs/tests/integration/repository.test.ts` — Integration tests for `auditLogRepository` run against an in-memory MongoDB instance. They verify `create`, `search` (filtering, `since` semantics, pagination metadata, serialization), and a deep-paging scenario that fails against any implementation that caps reads instead of truly paginating.
- `src/modules/audit-logs/tests/unit/retention.test.ts` — Unit test that verifies the audit-log collection's TTL index is configured with the correct `expireAfterSeconds` value derived from the `NODE_AUDIT_RETENTION_DAYS` environment variable, including the 90-day default used when the variable is unset.
- `src/modules/audit-logs/tests/unit/schema-contract.test.ts` — Contract tests that lock down the Mongoose schema for audit-log entries: which fields are required, which fields are restricted to closed enum sets, which Mongoose options are set (`timestamps`, `bufferCommands`), and which indexes exist with what options (including the single TTL index). The file exists to make schema drift visible as a test failure rather than a silent production gap.
- `src/modules/audit-logs/tests/unit/service.test.ts` — Unit tests for `auditLogService` verifying its two intentionally asymmetric failure contracts: `record` is fail-open (swallows write failures into a log line, never throws) and `search` is fail-closed (propagates failures to the caller). The repository is mocked because a real one cannot be made to fail on demand.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
