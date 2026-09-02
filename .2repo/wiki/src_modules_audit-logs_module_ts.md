# src/modules/audit-logs/module.ts

## Purpose

Side-effect-only module that wires the audit-log persistence sink into the observability layer at import time. It exists so that calling `emitAuditEvent` anywhere in the codebase transparently persists entries to the database, without any call-site needing to know about the storage implementation.

## Key elements

- **`registerAuditSink(auditLogService.record)`** (module-level call, not an export) — installs `auditLogService.record` as the sink that the observability layer invokes for every audit event. Runs once when the module is imported.
- **`export default { name: 'audit-logs' } satisfies AppModule`** — the manifest entry. A "headless" module: no router, no middleware. Its only job is the import-time side effect above.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — provides `registerAuditSink`, which this module calls to hand off the persistence function. All `emitAuditEvent` call sites in the codebase import from that file, *not* from here.
- **`src/modules/audit-logs/service.ts`** — provides `auditLogService`; its `.record` method is the function installed as the sink.
- **`src/kernel/registry.ts`** — supplies the `AppModule` type used in the `satisfies` constraint on the default export.
- **`src/modules.ts`** — the barrel that imports this module, triggering the side effect at application boot.

## Notes

- **No imports of this file anywhere.** It is never imported by name; it is pulled in solely through `src/modules.ts`. Removing it from that barrel (or deleting the file) silently disables audit persistence — there is no error, just lost events.
- **Retention is not code.** Expiry is enforced by a TTL index on the MongoDB collection (see `./model`). Changing the retention window requires no TypeScript edits in this file.
- **No router declared.** The single read endpoint (`GET /observability/audit`) lives in the dashboard/observability module, not here.
