---
source: src/modules/audit-logs/module.ts
sha256: 8fef811bfcf4f1ffc91cd2b4e11a42ca8e9d6384b7bc182a6ea709dab77012d3
generated_at: 2026-11-08T05:08:14.550970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose

Module manifest that wires the audit-logs feature into the application. It registers the persistence sink (so `emitAuditEvent` call sites elsewhere can write rows), mounts the `GET /audit` router, and declares config, locales, and a personal-data export handler. It is the single place where the audit collection becomes *enabled*; importing the file for a type alone does not trigger persistence.

## Key elements

- **`onRegistered`** – Calls `registerAuditSink(auditLogService.record)` to attach the audit-logs service as the global sink. Runs only after the module is confirmed enabled, not at import time.
- **Default export (`AppModule`)** – The module manifest:
  - `name: 'audit-logs'`
  - `mounts` – Attaches `router` (from `./routes`) at basePath `/audit`.
  - `config` – Exposes `auditLogsConfig.slice` for the config system.
  - `locales` – Points at a `locales/` directory relative to this file.
  - `personalData` – Declares an `auditLog` section that calls `auditLogService.findOwnAuditEntries(userId)` for GDPR/data-subject requests.

## Relationships

- **`src/infrastructure/observability/audit.ts`** – Imports `registerAuditSink`; this module is the *consumer* of that infrastructure, installing its own service as the sink. All write-side call sites in the codebase go through `@infrastructure/observability/audit`, never through this module directly.
- **`src/kernel/registry.ts`** – Imports the `AppModule` type; the default export satisfies that contract.
- **`src/modules.ts`** – Aggregates/imports this module's default export so the kernel knows to register it.
- **`src/modules/audit-logs/routes.ts`** – Provides the `router` object mounted at `/audit`; gated on the `read:AuditLog` permission.
- **`src/modules/audit-logs/service.ts`** – Provides `auditLogService.record` (the sink callback) and `auditLogService.findOwnAuditEntries` (the personal-data collector).
- **`src/modules/audit-logs/config.ts`** – Provides `auditLogsConfig` whose `.slice` is exposed via the manifest.
- **`src/infrastructure/observability/audit.ts` (read path)** – The observability module exposes `GET /observability/audit` across all shops using the same underlying collection; this module's docs explain why one collection serves both readers.

## Notes

- Retention is enforced by a **TTL index** on the collection (defined in `./model`), not by any TypeScript logic. Changing the retention window requires no code changes in this file or its neighbors.
- The write side is **fire-and-forget**: `emitAuditEvent` never imports this module. Deleting or disabling this module stops persistence silently without breaking callers.
- The `onRegistered` hook exists specifically to avoid side-effects at import time — a test or type-only import of this file will *not* start writing audit rows.
- Two read endpoints share one collection: `GET /audit` (this module, per-shop) and `GET /observability/audit` (observability module, cross-shop). See `docs/modules/audit-logs.md` for the rationale.
