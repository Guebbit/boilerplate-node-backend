# src/modules/audit-logs/index.ts

## Purpose

Public barrel (export surface) for the `audit-logs` module. It is the **only** file a sibling module is allowed to import from this directory (same convention as `modules/products/index.ts`). It exists to keep the module's internal structure (service, repository, model, types) encapsulated while still exposing the read path that `observability` needs to serve `GET /observability/audit`.

## Key elements

- **`auditLogService`** — re-exported from `./service`. This is the single export of the barrel; it is the repository/model object that consumers use to read the audit trail. No other symbols (types, helpers, model) are re-exported.

## Relationships

- **`./service`** (`src/modules/audit-logs/service.ts`) — sole import target. `auditLogService` is defined there; this file merely re-exports it.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — downstream consumer. It imports `auditLogService` *through this barrel* (not directly from `./service`) to read entries for the `GET /observability/audit` endpoint.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — unit-tests `auditLogService` directly (imports `./service` internally, not the barrel). The barrel is not a test dependency.

## Notes

- The barrel intentionally exports **one symbol only**. If `observability` or another module needs types from the audit-log model, the convention (per the comment) is that this is "this module's business, not the dashboard's"—meaning the types should travel through the service's public API rather than being re-exported here.
- Write-path registration happens at import time in `module.ts`; it is **not** performed through this file.
- The module owns a collection and has **no URL** of its own; the only HTTP surface is the read endpoint owned by `observability`.
