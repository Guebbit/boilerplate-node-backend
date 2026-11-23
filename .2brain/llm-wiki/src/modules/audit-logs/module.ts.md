---
source: src/modules/audit-logs/module.ts
source_sha256: 103a6a3a822f4de2c5f71a8e408f4431d5382a64a8f757916c9cc1e60ab36a49
context_sha256: 6c36dabf56be282674f1cd1aad662a4e3e4a46ee0cfd0cb58d3c9786be9b4f54
generated_at: 2026-11-22T04:26:59.342173+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/module.ts

## Purpose
Manifest entry for the `audit-logs` module, the queryable audit trail ("who did what"). Retention is enforced by a TTL index on the collection (defined in `./model`), not by code in this file. The module is the persistence side of auditing: it installs itself as the sink that `emitAuditEvent` call sites write to.

## Key elements
- **default export** – an `AppModule` object (checked with `satisfies AppModule`):
  - `name: 'audit-logs'`
  - `mounts`: mounts `router` at `/audit`.
  - `config`: contributes `auditLogsConfig.slice`.
  - `onRegistered`: the hook described below.
  - `locales`: points to the `locales` directory beside this file.
  - `personalData`: two collectors, with section `auditLog` using `auditLogService.findOwnAuditEntries(subject.userId)` and section `consultations` using `auditLogService.findConsultationsOf(subject.userId)`.
- **`onRegistered`** (internal) – calls `registerAuditSink(auditLogService.record)`, so audit events are persisted only once the module is registered as enabled.

## Relationships
- `@infrastructure/observability/audit` (`src/infrastructure/observability/audit.ts`): provides `registerAuditSink`. Emitters talk only to that file, not to this module.
- `@kernel/registry` (`src/kernel/registry.ts`): provides the `AppModule` type that the manifest must satisfy. It presumably calls `onRegistered`.
- `./service` (`service.ts`): `auditLogService` supplies `record` (the sink) and the two personal-data finders.
- `./routes` (`routes.ts`): supplies the `router` mounted at `/audit`.
- `./config` (`config.ts`): supplies the `auditLogsConfig` export, whose `slice` is listed under `config`.
- `src/modules.ts`: part of the module graph. This file doesn't show how it is used.
- `src/modules/observability/module.ts`: its `GET /observability/audit` is the platform-operator reader of the same collection, per the header comment.
- `src/modules/access/module.ts`: listed as a neighbor, but this file shows no interaction with it. The header only mentions that `GET /audit` is gated on `read:AuditLog`.

## Notes
- The sink is installed in `onRegistered`, not in `app.ts` and not at import time. Otherwise, importing this file (for a type, or in a test) would silently start persisting audit rows.
- Writes are fire-and-forget. Removing the module just stops persistence, and nothing imports it for writing.
- `GET /audit` serves a shop's own staff and is gated on `read:AuditLog`. One collection serves both this and the operator's cross-shop endpoint.
- Changing the retention window means changing the TTL index in `src/modules/audit-logs/model.ts`. No TypeScript in this file changes.
