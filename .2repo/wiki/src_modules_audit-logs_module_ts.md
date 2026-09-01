# src/modules/audit-logs/module.ts

## Purpose

Wires the audit-logs module into the application by registering its persistence sink at import time. It is a headless module (no router): its sole job is to call `registerAuditSink` so that every `emitAuditEvent` call from the observability layer is persisted. The single read endpoint (`GET /observability/audit`) lives on the dashboard side, not here.

## Key elements

- **`registerAuditSink(auditLogService.record)`** — top-level side-effect call executed on import. Binds the observability layer's sink to the service's `record` method. Deleting this file simply stops persistence; no other code changes.
- **`export default { name: 'audit-logs' } satisfies AppModule`** — the module manifest entry. Contains only a name; no `router`, no `middleware`, no lifecycle hooks.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Provides `registerAuditSink`. This module consumes it to plug itself in as the sink. Call sites elsewhere in the app import *that* file, never this one.
- **`src/modules/audit-logs/service.ts`** — Provides `auditLogService.record`, the function actually bound as the sink. This module does not otherwise interact with the service.
- **`src/kernel/registry.ts`** — Supplies the `AppModule` type used in the `satisfies` clause on the default export.
- **`src/modules.ts`** — The aggregation point that imports this module (for the side effect of sink registration). No other file imports this module.

## Notes

- **Side-effect import pattern.** This file is imported purely for the `registerAuditSink` call. It exports no runtime values beyond the manifest object. If you remove the import from `src/modules.ts`, audit events are still emitted but never persisted.
- **Retention is a DB-level TTL index**, not TypeScript code (lives in `./model`). Changing the retention window requires no code change here.
- **No router is declared.** Do not expect a route definition in this file or look for one when debugging the audit endpoint.
