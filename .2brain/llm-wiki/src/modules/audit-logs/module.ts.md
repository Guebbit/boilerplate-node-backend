---
source: src/modules/audit-logs/module.ts
sha256: df2104781b15e0e12e60ea7929e5176ae40e839387722a870813ee74a313fd35
generated_at: 2026-09-27T14:42:48.525733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose

Module manifest for the read-only audit trail. It declares the module's identity (name, base path, routes, locales, permissions, personal-data hook) and, via its `onRegistered` hook, wires the persistence sink so that `emitAuditEvent` calls flow into this module's collection. The module provides two read surfaces: `GET /audit` (own shop, gated on `audit.any.read`) and, through the observability module, `GET /observability/audit` (platform-wide).

## Key elements

- **`onRegistered`** — Calls `registerAuditSink(auditLogService.record)` to install the write sink. Runs only when the module is registered (enabled), never at import time, so type-only imports or tests don't silently start persisting rows.
- **`export default` (the `AppModule` manifest)** — Declares `name: 'audit-logs'`, `basePath: '/audit'`, `routes`, `locales`, `personalData`, and `permissions`. Satisfies the `AppModule` type from the kernel registry.
- **`personalData`** — A DSAR/GDPR collection hook that calls `findOwnAuditEntries(subject.userId)` to retrieve a subject's audit rows.
- **`permissions`** — Introduces the single key `audit.any.read`. Deliberately read-only; no write permission exists because no code path mutates audit rows.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — Source of `registerAuditSink`. This module calls it in `onRegistered` passing `auditLogService.record` as the sink. All `emitAuditEvent` call sites in the codebase talk to this infrastructure module, never to this file directly.
- **`src/kernel/registry.ts`** — Provides the `AppModule` type that the default export satisfies; defines the module lifecycle contract (`onRegistered`, etc.).
- **`src/modules/audit-logs/service.ts`** — Source of `auditLogService` (the sink target) and `findOwnAuditEntries` (the personal-data collector).
- **`src/modules/audit-logs/routes.ts`** — Source of `router`, mounted at the module's `basePath`.
- **`src/modules.ts`** — Module discovery/registration entry point that loads this manifest and invokes `onRegistered` when the module is enabled.

## Notes

- **Retention is not in code.** The TTL index on the collection (see `./model`) enforces the retention window. Changing the window is a schema/index change, not a TypeScript change.
- **Sink registration is fire-and-forget.** Removing the module from the enabled set simply stops persistence; no other code references this module for its write side.
- **Two readers, one collection.** The doc header points to `docs/modules/audit-logs.md` for the rationale behind serving both shop-staff and platform-operator queries from a single collection rather than two.
- **Permission cleanup is enforced by test.** `tests/cross-cutting/module-permissions.test.ts` fails if `audit.any.read` remains in the shared permission file after this module is deleted.
