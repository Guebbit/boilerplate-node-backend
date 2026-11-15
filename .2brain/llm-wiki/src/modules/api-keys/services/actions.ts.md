---
source: src/modules/api-keys/services/actions.ts
sha256: 708e04afeb8b96dc2b24d6c142a2ec46846a0c87954d8f8df2308cd57d7fc1ab
generated_at: 2026-11-14T19:20:56.699235+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/actions.ts

## Purpose

Centralizes the decision of *which actions a caller may perform* on an API-key record. The only action available is **revoke**, gated by the caller's `delete:ApiKey` permission and the credential's own `revokedAt` state. By resolving the ability once per page (not once per row), it keeps client-side permission logic out of the UI layer.

## Key elements

- **`actionsForRows(context: TenantCallerContext)`** — Returns a row-level function `(row: Pick<StoredApiKey, 'revokedAt'>) => ApiKeyActions`. Internally calls `permitsOnRows(caller, 'ApiKey', ['delete'])` once, then the returned closure checks `permits({}).delete && !row.revokedAt` to produce `{ revoke: boolean }`.

## Relationships

- **`src/kernel/ability.ts`** — Source of `permitsOnRows`, the generic ability-checking utility this file delegates all permission logic to.
- **`src/modules/api-keys/repository.ts`** — Supplies the `StoredApiKey` type; this file only depends on its `revokedAt` field.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Define `ApiKeyActions` and `TenantCallerContext`, the input/output types consumed here.
- **`src/modules/api-keys/services/api-keys.ts`** — Upstream service that calls `actionsForRows` when assembling API-key list responses.
- **`src/modules/api-keys/tests/unit/actions.test.ts`** — Unit tests covering the revoke-permission and already-revoked branches.

## Notes

- The design intent (stated in the header doc) is a *tactical DDD* pattern: the server is the single authority for "what can this caller do here," so no client re-derives permissions. See `docs/theory/tactical-ddd.md#_2-capabilities-the-server-answers-what-a-client-may-do`.
- A revoked key is never offered a revoke action (it would be an accepted no-op). The control is hidden, not disabled.
- The row parameter only needs `revokedAt` — the file deliberately avoids pulling in the full `StoredApiKey` shape.
