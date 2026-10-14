---
source: src/modules/audit-logs/module.ts
sha256: 9517908886b14debc53fb62060faad803c75f33356afabbe1a76c3b7fcc943ff
generated_at: 2026-10-14T15:04:55.802143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose

Module manifest for the audit-logs feature. It assembles the service, router, and config into a single `AppModule` object and installs the persistence sink (`auditLogService.record`) as the audit writer when the module is registered. It exists so the app kernel can discover, enable, and wire the module declaratively without importing its internals at module-load time.

## Key elements

- **`onRegistered`** (private) — calls `registerAuditSink(auditLogService.record)`, making this module the persistence target for all `emitAuditEvent` calls. Runs once when the kernel confirms the module is enabled.
- **`default export`** (`AppModule`) — the manifest: `name: 'audit-logs'`, `basePath: '/audit'`, `routes` (from `./routes`), `config` (sliced from `./config`), `locales` path, and a `personalData` handler that exposes a subject's own audit entries via `findOwnAuditEntries`.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — source of `registerAuditSink`; defines the write-side contract that all `emitAuditEvent` call sites use. This module is the *sink*, not the emitter.
- **`src/kernel/registry.ts`** — provides the `AppModule` type the manifest satisfies.
- **`src/modules.ts`** — imports this file's default export to include the module in the app's module list.
- **`src/modules/audit-logs/config.ts`** — supplies `auditLogsConfig` (the config slice) used in the manifest.
- **`src/modules/audit-logs/routes.ts`** — supplies `router`, mounted under `/audit`, gated on the `audit.any.read` permission.
- **`src/modules/audit-logs/service.ts`** — supplies `auditLogService` (the sink target) and `findOwnAuditEntries` (the personal-data export handler).

## Notes

- Sink registration is deferred to `onRegistered` deliberately: a type import or test importing this file must *not* start persisting audit rows as a side effect.
- Retention is enforced by a TTL index on the collection (defined in `./model`), not by any code in this file. Changing the window is a schema/index change with no TypeScript impact.
- Two distinct readers share the same collection: this module's `GET /audit` (shop staff, `audit.any.read`) and the observability module's `GET /observability/audit` (platform operator). The single-collection design is documented in `docs/modules/audit-logs.md`.
- No code imports this file for its write path. Callers talk to `@infrastructure/observability/audit` directly; this module only *receives* the sink registration. Removing the module simply stops persistence without breaking emitters.
