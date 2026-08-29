# src/modules/audit-logs/module.ts

## Purpose

Headless module that installs the audit-log sink into the observability layer at import time. It owns the `audit-logs` domain collection but declares no router; the single read endpoint (`GET /observability/audit`) lives in the dashboard module that renders the data. Enabling this module without `observability` is a valid build — the trail is stored but nothing exposes it.

## Key elements

- **`registerAuditSink(auditLogService.record)`** — executed at import time (top-level). Wires `service.record` as the active sink in the observability infrastructure. Not a DB call; `record` is fire-and-forget and only touches Mongo when an event actually fires (i.e., during a served request).
- **`export default { name: 'audit-logs', subdomain: 'generic' } satisfies AppModule`** — the module manifest. `subdomain: 'generic'` reflects that "who did what, kept for N days" is a cross-cutting requirement, not a business subdomain. The `AppModule` type is the shared contract the registry expects.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — provides `registerAuditSink`. This file calls it once at import to install the sink. The ~53 `emitAuditEvent` call sites across the app talk to this infrastructure module, never to this file directly.
- **`src/modules/audit-logs/service.ts`** — provides `auditLogService.record`, the function actually passed as the sink. This module is its only consumer.
- **`src/kernel/registry.ts`** — defines the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — the assembly/manifest aggregator that imports this module's default export; deleting this file stops audit storage without breaking that assembly.

## Notes

- Registration is deliberately at import time, not in `app.ts`, so the assembly file never names a domain. Deleting this file is the cleanest way to disable audit persistence.
- The TTL index (enforced elsewhere, presumably in the service or schema) governs retention; this module does not manage it.
- There is no router, no middleware, and no request-handling logic here — it is purely a wiring + manifest file.
