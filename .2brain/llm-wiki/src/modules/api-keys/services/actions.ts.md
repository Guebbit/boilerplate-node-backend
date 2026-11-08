---
source: src/modules/api-keys/services/actions.ts
sha256: a2c3bd6e2dfb6a5183e7c016eda2a868cb3ce150cbb0bd50248bc4c27358986b
generated_at: 2026-11-08T05:03:58.101833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/actions.ts

## Purpose

Declares the single action a caller may take on an API-key record (revoke) by mapping the `delete:ApiKey` ability key and the credential's `revokedAt` state into a per-row `ApiKeyActions` object. The ability is resolved once per request, then applied row-by-row, so a list page costs one permission lookup rather than one per credential.

## Key elements

- **`actionsForRows(context: TenantCallerContext)`** — Returns a row-level function `(row: Pick<StoredApiKey, 'revokedAt'>) => ApiKeyActions`. Internally calls `permitsOnRows` once with the `['delete']` action list and a single `ApiKey` subject, then per row computes `{ revoke: permits({}).delete && !row.revokedAt }`.
- Only one action is exposed: `revoke`. There are no other keys in `ApiKeyActions` consumed here.

## Relationships

- **`src/kernel/ability.ts`** — Provides `permitsOnRows`, the kernel-level ability builder that this module delegates permission checks to.
- **`src/modules/api-keys/repository.ts`** — Supplies the `StoredApiKey` type; this file only reads the `revokedAt` field from it.
- **`src/modules/api-keys/services/api-keys.ts`** — The main API-keys service; expected caller of `actionsForRows` to attach actions to list/detail responses.
- **`src/types/auth-context.ts`** — Defines `TenantCallerContext`, the caller shape passed into `actionsForRows`.
- **`src/types/index.ts`** — Re-exports `ApiKeyActions` and `TenantCallerContext` under the `@types` alias.
- **`src/modules/api-keys/tests/unit/actions.test.ts`** — Unit tests covering the `actionsForRows` logic.

## Notes

- A revoked credential (`revokedAt` is truthy) always yields `revoke: false`, even if the caller holds the `delete:ApiKey` permission. The comment in the source explains the alternative (sending the delete request as an accepted no-op) was deliberately rejected.
- The row parameter is a `Pick` of `StoredApiKey`, not the full entity — callers only need to pass `revokedAt`.
- `permitsOnRows` is called with an empty subject object `{}` (no specific id), reflecting that the action set is the same for every row in the module.
