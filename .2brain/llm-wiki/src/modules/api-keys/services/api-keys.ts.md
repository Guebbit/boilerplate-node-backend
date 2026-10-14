---
source: src/modules/api-keys/services/api-keys.ts
sha256: b763ffc9772aab60fdc6acc3d5ec5deafefbc291e5253723036e5e679fd65fdd
generated_at: 2026-10-14T15:00:59.941822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Service layer for tenant-scoped API-key credential CRUD: listing, minting (with permission-subset validation and audit), revocation (idempotent soft-revoke), bulk revocation on account events, and data-export reads. All operations are narrowed to `context.caller.tenantId`; no key in this family carries a secret after the single `mint` response.

## Key elements

- **`isMintable(key, caller)`** — Private guard. Returns `true` only if the key is declared, `scope: 'tenant'`, has no `stepUp` tier, and is in `heldKeys(caller)`. Prevents a minter from granting permissions they don't hold or that are step-up-gated.
- **`latestExpiry(now?)`** — Computes the maximum allowed `expiresAt`: one calendar year ahead of `now` (uses `setFullYear`, not a day-count).
- **`notifyMinted(minterId, apiKey)`** — Fire-and-forget email to the minter. Resolves the user fresh, formats the expiry with `Intl.DateTimeFormat` in the user's locale, and enqueues via `enqueueEmail`. Failures are logged, never thrown.
- **`findOwnApiKeys(userId)`** — Unpaginated read-all of a user's keys (metadata only) for the account's data-export hook. Uses `readAll` from the persistence layer.
- **`apiKeysDeleteByUserId(userId, session)`** — Hard-delete hook (`personalData.erase`). Joins the caller's Mongoose transaction.
- **`list(context, filters)`** — Paginated, newest-first listing scoped to the caller's tenant. Never exposes the hash.
- **`mint(body, context)`** — Validates expiry ≤ 1 year and that every requested permission passes `isMintable`. Mints via `mintApiKey()`, persists, fires `notifyMinted`, records an audit entry, and returns the one-time plaintext secret (201).
- **`revoke(id, context)`** — Soft-revokes a single key (sets `revokedAt`). Idempotent: already-revoked returns 200. Tenant-mismatch returns 404. Not outranked — any tenant admin may revoke any key in the tenant.
- **`notifyRevoked(userId, reason, revoked)`** — Fire-and-forget email listing the revoked keys and the reason (e.g. "password reset"). Same pattern as `notifyMinted`.
- **`revokeAllMintedBy(userId, reason)`** — Bulk-revokes every live key a user minted. Used by the account module when sessions are ended wholesale. Audited as a system act, then `notifyRevoked` is called.

## Relationships

- **`@infrastructure/http/response`** — All exported endpoints return `ResponseSuccess` / `ResponseReject` built by `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — Error messages go through `t()`; user-facing email locale comes from `getDefaultLocale()`.
- **`@infrastructure/observability/audit`** — `recordAudit` is called on successful mint and revoke.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the transport for both mint and revoke notifications.
- **`@infrastructure/adapters/logger`** — `.warn` is the only side-effect when email delivery fails.
- **`@infrastructure/persistence/search`** — `readAll` and `MAX_CONFIGURED_PAGE_SIZE` power the unpaginated export read.
- **`@kernel/ability`** — `heldKeys(caller)` provides the set of keys the caller currently holds, the basis of the mintable check.
- **`@kernel/permissions`** — `findKey(key)` looks up a key's declared scope and step-up tier.
- **`@modules/account`** — `SessionsRevokedReason` (type import) and the account module's session-termination flow are the callers of `revokeAllMintedBy`.
- **`@modules/api-keys/credentials`** — `mintApiKey()` (generates plaintext + hash + public prefix) and `displayIdOf` (human-readable key identifier) are consumed here.
- **`@modules/api-keys/audit`** — `apiKeysAuditActions` provides the stable action strings for audit records.

## Notes

- **Tenant scoping is assumed, not optional.** Every query filters on `context.caller.tenantId`; there is no platform-scope path in this file.
- **Idempotent revoke.** Revoking an already-revoked key returns 200, not 404. Callers (e.g. `revokeAllMintedBy`) rely on this.
- **No outrank on revoke.** Deliberately absent — any tenant admin can revoke a fellow admin's key. The gate is the tenant check only.
- **Fire-and-forget emails.** Both `notifyMinted` and `notifyRevoked` swallow errors after a `logger.warn`. A down mailer queue must not turn a successful mint/revoke into an HTTP error.
- **`createdByUserId` is non-null by construction.** The router middleware guarantees a live session before any of these routes execute, so the `!` on `context.caller.id` is safe.
- **Export is unpaginated on purpose.** `findOwnApiKeys` is a one-time full answer for data export, not a paginated listing.
