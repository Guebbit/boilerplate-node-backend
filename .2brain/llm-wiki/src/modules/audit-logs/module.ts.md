---
source: src/modules/audit-logs/module.ts
sha256: a349b53f97573d701519c45a516f88409e0024985a85849f906e76550ca70463
generated_at: 2026-11-14T19:24:29.929659+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose

Module registration entry point for the **audit-logs** module. It wires the module's HTTP router, config slice, and personal-data collectors into the kernel's `AppModule` contract, and — via its `onRegistered` hook — plugs the audit log service's record method in as the persistence sink that `@infrastructure/observability/audit` calls on every `emitAuditEvent`. It exists so that enabling/disabling the module is a single toggle: unregistered → no sink → audit events are dropped silently.

## Key elements

- **`onRegistered`** (module-local, not exported) — calls `registerAuditSink` with the audit log service's record method. Runs once after the kernel confirms the module is enabled, not at import time, so that merely importing this file (e.g. in a type-level test) never starts writing rows.
- **`export default { … } satisfies AppModule`** — the manifest object:
  - `name: 'audit-logs'`
  - `mounts` — attaches the module's router (from `./routes`) at `/audit`.
  - `config` — exposes `auditLogsConfig.slice` (from `./config`).
  - `onRegistered` — the hook above.
  - `locales` — directory path for i18n strings.
  - `personalData` — two collectors (`auditLog`, `consultations`) that delegate to the audit log service for GDPR-style subject access.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — imports `registerAuditSink`; at runtime the module's `onRegistered` injects the audit log service's record method as the sink that this infrastructure layer calls. The write path for every `emitAuditEvent` in the codebase flows through this single registration.
- **`src/kernel/registry.ts`** — provides the `AppModule` type used in the `satisfies` check; defines the shape every module manifest must conform to.
- **`src/modules/audit-logs/service.ts`** — provides `auditLogService`, which serves as both the persistence sink (its record method) and the backend for the personal-data collectors.
- **`src/modules/audit-logs/routes.ts`** — provides the router mounted at `/audit` for shop-scoped, `read:AuditLog`-gated query endpoints.
- **`src/modules/audit-logs/config.ts`** — provides `auditLogsConfig`; the module's configuration slice for the kernel's config registry.
- **`src/modules.ts`** — upstream consumer: this file is imported there so the kernel can discover and register the module.

## Notes

- **Retention is not code.** The audit collection is pruned by a MongoDB TTL index (see `./model`), not by any TypeScript in this file. Changing the retention window requires only an index change — no code diff.
- **Two readers, one collection.** The shop-scoped `GET /audit` endpoint (this module) and the cross-shop operator-facing `GET /observability/audit` endpoint (the observability module) both read the same collection. Don't split it; see `docs/modules/audit-logs.md` for the rationale.
- **Write side is decoupled.** Nothing imports this file to write audit events. All `emitAuditEvent` call sites talk to `@infrastructure/observability/audit` directly; this file only installs the sink. Deleting the module stops persistence without breaking producers.
- **`onRegistered` timing matters.** The sink is registered post-confirmation (not at import time) specifically so that type-check imports or unit-test imports don't silently start persisting rows.
