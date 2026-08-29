# src/modules/audit-logs/index.ts

## Purpose

Barrel file that exposes the audit-logs module's single public symbol. Sibling modules are expected to import only through this file (same convention as `modules/products/index.ts`). The module owns a database collection but no HTTP URL; its write sink is registered at import time by the module's own `module.ts`, while its read path is served by the `observability` module.

## Key elements

- **`auditLogService`** (re-exported from `./service`) — the sole export. It is the read interface that `observability` uses to query the audit trail. The repository, model, and related types that back it are intentionally *not* re-exported; they remain internal to the module.

## Relationships

- **`./service.ts`** — source of the single re-export. This file adds no logic; it simply forwards `auditLogService`.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — primary consumer. `observability` owns `GET /observability/audit` and reaches the audit-logs service *through this barrel* rather than importing `./service` directly.
- **`src/modules/audit-logs/tests/unit/service.test.ts`** — unit-tests the service object this barrel exposes. The test targets `service.ts` directly, not the barrel, but the barrel is what other modules see.

## Notes

- **Write path is NOT wired through this file.** It is registered by `module.ts` at import time as the sink behind `@infrastructure/observability/audit`. `app.ts` deliberately does not name this domain to do the wiring.
- **One export is a deliberate boundary**, not an oversight. If a future consumer needs the repository or a type, the correct response is to add an explicit re-export here with a comment explaining why, not to reach into `./service` from outside the module.
