---
source: src/modules/api-keys/services/api-keys.ts
sha256: 390ac7c4dc9bcb1e5584115acff0ba86e120eddd0cbd23049da7f501b39a6def
generated_at: 2026-09-23T18:25:20.296846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Service layer for API-key credential management: listing, minting, and revoking tenant-scoped API keys. It enforces that mints can only grant permissions the caller actually holds, records audit events on write operations, and returns wire-shaped responses (never raw secrets).

## Key elements

- **`isMintable(key, caller)`** (internal) — Returns `true` only when the permission key is _declared_ in the permission registry, scoped to `tenant`, and _held_ by the caller via `holdsKey`.
- **`list(context, filters)`** — Paginated search of the caller's tenant credentials, newest-first. Returns `PaginatedResult<ApiKey>`; secrets are stripped by the model transform.
- **`mint(body, context)`** — Validates `body.permissions` is a non-empty subset of the caller's held tenant keys (422 with offending keys otherwise), generates a credential via `mintApiKey()`, persists it, records an audit event, and returns 201 with the plaintext secret shown exactly once.
- **`revoke(id, context)`** — Soft-deletes by stamping `revokedAt`. Idempotent: an already-revoked key yields `generateSuccess(undefined)`, not a 404. Cross-tenant access returns 404. Records an audit event.

## Relationships

- **`apiKeyRepository`** (`../repository`) — Sole persistence interface; all reads/writes go through it with `tenant` narrowing.
- **`mintApiKey`, `displayIdOf`** (`../credentials`) — Credential generation (plaintext, public prefix, hash) and display-Id formatting.
- **`apiKeysAuditActions`** (`../audit`) — Enumerated action strings (`ADMIN_API_KEY_MINTED`, `ADMIN_API_KEY_REVOKED`) passed to `recordAudit`.
- **`holdsKey`** (`kernel/ability`) — Ability-backed "does this caller hold this key?" check; same guard used by other route guards.
- **`findKey`** (`kernel/permissions`) — Looks up a key's declaration (scope) in the permission registry.
- **`generateSuccess` / `generateReject`** (`infrastructure/http/response`) — Standard HTTP response envelope construction.
- **`t`** (`infrastructure/i18n`) — Localised error messages (e.g. `api-keys.permission-not-mintable`).
- **`recordAudit`** (`infrastructure/observability/audit`) — Writes structured audit log entries.
- **`PaginatedResult`** (`infrastructure/persistence/create-repository`) — Shared pagination shape returned by `list`.
- **`TenantCallerContext`, `Caller`, `MintApiKeyRequest`, `ApiKeyCreated`, `ApiKey`** (`types`) — Request/response and auth-context types.
- **`ApiKeyDocument`** (`../model`) — Stored document shape; `apiKey.toJSON()` applies the model transform before returning.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — Integration tests exercise these three exported functions.

## Notes

- **Tenant scoping is implicit, not optional.** Every query filters on `context.caller.tenantId`; `Caller.tenantId` is only null in platform scope, which never reaches these routes (all keys in the family are `scope: tenant`).
- **`createdByUserId` uses a non-null assertion (`context.caller.id!`)** because the route chain (`router.use(getAuth, isAuth)`) guarantees a live session before this service runs.
- **Wire shape ≠ stored shape.** `apiKey.toJSON()` renames `_id` → `id` and omits internal fields; the service spreads that output plus the one-time `secret` into the 201 response.
- **Permissions are checked twice.** Subset validation happens at mint time here _and_ on every subsequent request via `module.ts`'s `CredentialResolver`, so a demoted minter cannot retain over-privileged keys.
- **`revoke` is deliberately idempotent** to support safe retry semantics from the admin UI.
