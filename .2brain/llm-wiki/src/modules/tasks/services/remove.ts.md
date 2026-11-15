---
source: src/modules/tasks/services/remove.ts
sha256: e3d129002bc994804bee62c834ca16b79892feada96ebc0bd30210e469a50451
generated_at: 2026-11-14T22:12:23.041275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/remove.ts

## Purpose

Permanently deletes a task by ID after verifying jurisdiction and delete permissions. Serves as the single "hard delete" entry point for the tasks module—there is no soft-delete tier to fall back on.

## Key elements

- **`removeById(id, context)`** — The sole export. Resolves the task, guards access (404 / 403), deletes via the repository, records an audit row, and returns a `ResponseSuccess<undefined>` or `ResponseReject`.

## Relationships

- **`src/modules/tasks/repository.ts`** — Provides the task repository used for the existence lookup and the deletion write.
- **`src/modules/tasks/access.ts`** — Provides `inJurisdiction` (404 gate) and `mayDelete` (403 gate) for access control before any write.
- **`src/modules/tasks/audit.ts`** — Provides the audit action constants referenced in the post-delete audit event.
- **`src/infrastructure/observability/audit.ts`** — Supplies `recordAudit` to emit the post-delete event.
- **`src/infrastructure/i18n/index.ts`** — Supplies `t()` for localized 404/403 error messages.
- **`src/infrastructure/http/response.ts`** — Supplies `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types.
- **`src/types/index.ts`** → **`src/types/auth-context.ts`** — Supplies the `CallerContext` type for the `context` parameter.
- **`src/modules/tasks/services/index.ts`** — Barrel that re-exports this module for consumers of the tasks service layer.

## Notes

- No `hardDelete` flag exists here (unlike the analogous `orders` service). This path is *always* a permanent delete; there is no soft-delete branch to toggle.
- The 404 path conflates "not found" and "outside your jurisdiction"—intentional, to avoid leaking existence of tasks in other jurisdictions.
- Audit recording happens *after* the repository write resolves but *before* the success response is returned, so the audit row is part of the same promise chain.
