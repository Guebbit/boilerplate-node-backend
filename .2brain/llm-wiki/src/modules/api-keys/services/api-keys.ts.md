---
source: src/modules/api-keys/services/api-keys.ts
sha256: 4cf97f790c29d3445bb9082625408e20810e935149ef0d7286acc6cdad203a2a
generated_at: 2026-09-27T14:41:27.221382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Implements the credential CRUD operations (list, mint, revoke) for the API-keys module. Every function is tenant-scoped through `context.caller.tenantId`, validates permissions against the caller's current ability set, and records audit events on state-changing actions. This file is the service layer that the module's route handlers call into.

## Key elements

- **`isMintable`** (internal) — Returns `true` only if a permission key is declared, scoped to `tenant`, and currently held by the caller. Used as the gate in `mint`.
- **`findOwnApiKeys(userId)`** — Unpaginated full export of one user's credentials (metadata only, secrets stripped by the model transform). Intended for the `personalData.export` DDD hook.
- **`apiKeysDeleteByUserId(userId, session)`** — Hard-deletes all credentials for a user within the caller's Mongoose session. Intended for the `personalData.erase` DDD hook.
- **`list(context, filters)`** — Paginated, tenant-scoped listing of credentials, newest first. Returns `PaginatedResult<ApiKey>`; secrets are omitted by the model transform.
- **`mint(body, context)`** — Validates that `body.permissions` is a non-empty subset of the minter's current tenant-scoped keys (422 with offending keys otherwise), mints a plaintext/hash pair via `mintApiKey()`, persists it, audits, and returns the one-time plaintext secret in the 201 body.
- **`revoke(id, context)`** — Soft-deletes a credential (sets `revokedAt`). Idempotent: revoking an already-revoked key returns a no-op success rather than a 404. Audits on actual revocation.

## Relationships

- **`../repository` (`apiKeyRepository`)** — All persistence (search, create, findById, save, deleteByUserId) goes through this repository instance.
- **`../credentials` (`mintApiKey`, `displayIdOf`)** — `mintApiKey()` generates the plaintext/publicPrefix/hash triple; `displayIdOf` formats the prefix for audit metadata.
- **`../audit` (`apiKeysAuditActions`)** — Provides the action constants (`ADMIN_API_KEY_MINTED`, `ADMIN_API_KEY_REVOKED`) passed to `recordAudit`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every HTTP response returned by this service.
- **`@infrastructure/observability/audit` (`recordAudit`)** — Called after successful mint and revoke to emit an audit event.
- **`@infrastructure/persistence/search` (`readAll`, `MAX_CONFIGURED_PAGE_SIZE`)** — `readAll` drives the unpaginated loop in `findOwnApiKeys`; `MAX_CONFIGURED_PAGE_SIZE` bounds each page fetch.
- **`@kernel/ability` (`holdsKey`)** and **`@kernel/permissions` (`findKey`)** — Together form the `isMintable` check: `findKey` confirms the key is declared and tenant-scoped; `holdsKey` confirms the caller currently holds it.
- **`@infrastructure/i18n` (`t`)** — Localizes the 422 validation message and the 404 not-found message.
- **`@types` (`TenantCallerContext`, `Caller`)** — Type-level contract for the auth context passed into every exported function.
- **`../module.ts`** — Wires these exports to HTTP routes and provides the `CredentialResolver` that re-checks permissions at request time.
- **`../services/index.ts`** — Barrel re-export making these functions available to the module's route layer.

## Notes

- **Non-null assertion on `caller.id`**: In `mint`, `context.caller.id!` is safe because the route is behind `getAuth` + `isAuth` middleware, which guarantees a live session (and thus a real user id). The `Caller` type allows `id: null` for platform-scope callers, but that case is unreachable here.
- **`.toJSON()` in `mint`**: The returned `ApiKeyCreated` object is built from `apiKey.toJSON()`, which triggers the Mongoose schema transform (`applyApiKeyTransform`) that renames `_id` → `id` and omits the hash. The cast `as ApiKeyCreated` bridges the stored-document type to the wire shape.
- **Idempotent revoke**: Check `apiKey.revokedAt` *before* saving; a second call returns `generateSuccess(undefined)` with no audit record. This prevents duplicate audit noise.
- **404 vs 422 semantics**: A cross-tenant or non-existent id in `revoke` yields 404; an invalid permission set in `mint` yields 422 with the specific offending keys in `details.permissions`.
- **`findOwnApiKeys` is deliberately unpaginated**: It uses `readAll` with the max configured page size to drain all results. This is for a one-time data-export call, not a client-paginated listing.
