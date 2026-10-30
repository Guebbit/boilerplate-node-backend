---
source: src/modules/audit-logs/module.ts
sha256: 8fef811bfcf4f1ffc91cd2b4e11a42ca8e9d6384b7bc182a6ea709dab77012d3
generated_at: 2026-10-29T03:17:23.432271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose
Module manifest for the audit-logs feature. It assembles the router, config slice, and service into an `AppModule` and, via the `onRegistered` hook, wires the write-side sink so that `emitAuditEvent` calls from anywhere in the codebase persist rows through this module's service.

## Key elements
- **`onRegistered()`** — calls `registerAuditSink(auditLogService.record)`, making this module the concrete sink for all audit-event emissions.
- **`export default` (the `AppModule`)** — the manifest object:
  - `name: 'audit-logs'`
  - `mounts` — mounts `router` (from `./routes`) at `/audit`.
  - `config` — exposes `auditLogsConfig.slice` for the config system.
  - `locales` — points to a `locales/` directory alongside this file.
  - `personalData` — provides a `collect` callback (`auditLogService.findOwnAuditEntries`) for per-user data-export requests.

## Relationships
- **`src/infrastructure/observability/audit.ts`** — source of `registerAuditSink`; this file is the *consumer* that plugs the service in as the sink. No other module imports this file for writes.
- **`src/kernel/registry.ts`** — provides the `AppModule` type used in the `satisfies` check.
- **`src/modules.ts`** — the module list that activates this manifest at boot.
- **`src/modules/audit-logs/service.ts`** — supplies `auditLogService`, used both as the sink and in the personal-data collector.
- **`src/modules/audit-logs/routes.ts`** — supplies the `router` mounted at `/audit`.
- **`src/modules/audit-logs/config.ts`** — supplies `auditLogsConfig` for the config slice.

## Notes
- The sink is registered in `onRegistered`, **not** at import time. Importing this file for types or in tests will not silently start persisting audit rows.
- Retention is enforced by a TTL index on the collection (see `./model`), not by any code in this file. Changing the retention window requires only an index change—no TypeScript moves.
- Removing or disabling this module stops audit persistence entirely; no other write path exists.
