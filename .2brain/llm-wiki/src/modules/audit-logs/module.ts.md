---
source: src/modules/audit-logs/module.ts
sha256: 64aa7b2d025bc0079148c57451312a4cb7c985311382fa12bd7bdbfe60645d3e
generated_at: 2026-09-23T18:27:01.029444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.ts

## Purpose

Module manifest and import-time wiring for the audit-logs module. It registers the persistence sink that makes `emitAuditEvent` writes land in the collection, and declares the module's routes, locales, permission keys, and GDPR Art. 15 export so the kernel can assemble the app.

## Key elements

- **`registerAuditSink(auditLogService.record)`** — top-level side effect executed at import time; connects the observability audit emitter to this module's `record` method. Removing this file simply stops persistence (fire-and-forget).
- **`export default { … } satisfies AppModule`** — the module manifest:
  - `name: 'audit-logs'`, `basePath: '/audit'`, `routes: router`, `locales` path.
  - `personalData[].collect` — paginated Art. 15 export scoped to `actor: subject.userId` only; uses `readAll` + `search` with `MAX_CONFIGURED_PAGE_SIZE`.
  - `permissions: ['audit.any.read']` — the single read-only permission this module introduces; no write permission is declared by design.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — imports `registerAuditSink` and calls it here; all `emitAuditEvent` call sites across the codebase talk to that file, never to this one.
- **`src/infrastructure/persistence/search.ts`** — imports `readAll` and `MAX_CONFIGURED_PAGE_SIZE` for the personal-data export loop.
- **`src/kernel/registry.ts`** — provides the `AppModule` type constraint on the default export.
- **`src/modules/audit-logs/routes.ts`** — supplies the `router` attached to the manifest.
- **`src/modules/audit-logs/service.ts`** — supplies `auditLogService.record` (the sink target) and `search` (the Art. 15 query).
- **`src/modules.ts`** — imports this file's default export to register the module with the kernel.

## Notes

- Sink registration is an **import-time side effect**, deliberately not placed in `app.ts`. Order of imports matters: this module must be imported before the first `emitAuditEvent` call for events to persist.
- Retention (TTL) lives in a Mongo TTL index on the collection (see `./model`), not in TypeScript. Changing the retention window requires no code change.
- The personal-data `collect` callback is scoped to the actor's own rows. Widening the query to read other actors' rows would be the exact leak Art. 15 exists to prevent.
- `tests/cross-cutting/module-permissions.test.ts` fails CI if `audit.any.read` remains in the shared permission file after this module is deleted — a guard against orphaned keys.
- Two distinct readers share one collection: this module's `GET /audit` (shop staff, gated on `audit.any.read`) and `GET /observability/audit` (platform operator, from the observability module). See `docs/modules/audit-logs.md` for the rationale.
