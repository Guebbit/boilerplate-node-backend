---
source: src/modules/api-keys/services/actions.ts
sha256: a2c3bd6e2dfb6a5183e7c016eda2a868cb3ce150cbb0bd50248bc4c27358986b
generated_at: 2026-10-29T03:14:24.099705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/actions.ts

## Purpose

Defines the single action a client may perform on an `ApiKey` record — revocation — by combining the caller's `delete` permission with the credential's own state (`revokedAt`). Centralises the "what can this caller do to this row?" decision in one place so no client re-derives it.

## Key elements

- **`actionsForRows(context: TenantCallerContext)`** — The sole export. Returns a row-mapper function `(row) => ApiKeyActions`. Builds the ability check (`permitsOnRows(context.caller, 'ApiKey', ['delete'])`) **once** per page call, then the returned closure applies it per row. The `revoke` flag is `true` only when the caller has `delete` permission **and** `row.revokedAt` is falsy.

## Relationships

- **`src/kernel/ability.ts`** — Imports `permitsOnRows`, which performs the actual permission evaluation for the `ApiKey` resource.
- **`src/modules/api-keys/repository.ts`** — Imports the `StoredApiKey` type (via `Pick<…, 'revokedAt'>`) so the row shape is defined by the persistence layer, not duplicated here.
- **`src/types/index.ts`** — Source of the `ApiKeyActions` and `TenantCallerContext` types used in the signature.
- **`src/types/auth-context.ts`** — Underlying definition of `TenantCallerContext` (re-exported through the types barrel).
- **`src/modules/api-keys/services/api-keys.ts`** — Expected caller that invokes `actionsForRows` when building API responses for listing keys.
- **`src/modules/api-keys/tests/unit/actions.test.ts`** — Unit tests covering the permission × state matrix.

## Notes

- The ability check is built **once** and reused across rows; do not call `permitsOnRows` inside the per-row closure.
- A revoked credential returns `revoke: false` even if the caller has the `delete` permission — the action is withheld rather than allowed as a no-op.
- The row parameter is intentionally narrow (`Pick<StoredApiKey, 'revokedAt'>`), so callers need not supply a full record.
- The docstring references `docs/theory/tactical-ddd.md#2-capabilities-the-server-answers-what-a-client-may-do` for the design rationale.
