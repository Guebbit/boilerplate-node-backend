---
source: src/modules/account/roles.ts
sha256: 851c97ebea275e9f2712add3566601aaca9c623d35383c8ca3d8464df3a73a49
generated_at: 2026-11-08T04:15:06.479620+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/roles.ts

## Purpose

Provides a single helper that determines whether a given user holds an unrestricted (admin) role on the deployment tenant. It exists so that login emit logic and audit records can record the caller's effective role (`actorRole`) by reading the live membership store, since the account document itself carries no role field.

## Key elements

- **`isUnrestrictedCaller(userId: string): Promise<boolean>`** — Queries the user's roles on `DEPLOYMENT_TENANT_ID` via `accessService.rolesOf`, then passes the resulting `roles.tenant` value through the `isUnrestrictedRole` predicate. Returns `true` when the role is unrestricted.

## Relationships

- **`@kernel/permissions`** (`src/kernel/permissions.ts`) — Supplies the `isUnrestrictedRole` predicate used to classify the fetched role.
- **`@modules/access`** (`src/modules/access/index.ts`) — Exports `accessService`, whose `rolesOf` method is the data source for this check. The service implementation lives under `src/modules/access/services/index.ts`.
- **`@kernel/access/tenant`** (`src/kernel/access/tenant.ts`) — Provides the `DEPLOYMENT_TENANT_ID` constant that scopes the role lookup to the current deployment.
- **`src/modules/account/services/caller.ts`** and **`src/modules/account/session/login-observability.ts`** — Consumers that call `isUnrestrictedCaller` to populate `actorRole` in login emits and audit records.

## Notes

- The check is always a fresh read from the membership store; there is no cached or document-embedded role to rely on.
- Only the `roles.tenant` field is inspected. If a role check for a different tenant is needed, this function does not cover it.
