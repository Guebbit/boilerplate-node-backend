---
source: src/modules/api-keys/services/api-keys.ts
sha256: fede2db690376cc2fd987b9be7b0b9e3c41a960a42b4e5f3d34b13032a13c310
generated_at: 2026-10-15T10:20:42.996225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Service layer for credential (API key) CRUD: listing, minting, and revoking tenant-scoped API keys. Centralises permission validation at mint time, audit recording, email notifications, and the bulk-revoke path triggered by account-level events (logout-everywhere, password reset).

## Key elements

- **`isMintable`** (internal) — checks four conditions before a key may be granted on a credential: declared in the key catalog, tenant-scoped, no step-up tier, and actually held by the caller (`heldKeys`).
- **`latestExpiry`** — returns the maximum allowed expiry: one *calendar* year from `now` (via `setFullYear(+1)`), injectable clock for tests.
- **`notifyMinted`** (internal) — fire-and-forget email to the minter after a successful mint; resolves the minter's address fresh, formats the expiry in the recipient's locale, enqueues via the mailer.
- **`findOwnApiKeys`** — unpaginated full read of all keys a user minted (for account data export); uses `readAll` with `MAX_CONFIGURED_PAGE_SIZE`.
- **`apiKeysDeleteByUserId`** — hard-delete hook for the `personalData.erase` account event; joins the caller's Mongoose transaction.
- **`list`** — paginated, tenant-scoped listing of credentials, newest first; never returns a secret (model transform strips `hash`).
- **`mint`** — validates `expiresAt` and `permissions` subset, generates the key (via `mintApiKey`), persists, records audit, fires notification email; returns the plaintext secret exactly once (201).
- **`revoke`** — soft-revoke (sets `revokedAt`); idempotent (already-revoked → 200, not 404); tenant-mismatch → 404; records audit.
- **`notifyRevoked`** (internal) — fire-and-forget email listing which keys stopped working and why.
- **`revokeAllMintedBy`** — bulk-revokes every live key a user minted; called by the account module on wholesale session revocation; audited as a system act; mails the owner.

## Relationships

- **`@infrastructure/http/response`** — shapes all return values via `generateSuccess` / `generateReject` / `fieldError`.
- **`@infrastructure/observability/audit`** — calls `recordAudit` on mint and revoke.
- **`@infrastructure/adapters/mailer`** — calls `enqueueEmail` in both notification paths.
- **`@infrastructure/adapters/logger`** — `logger.warn` on fire-and-forget email failures.
- **`@infrastructure/i18n`** (`catalog`, `context`, `index`) — `t()` for user-facing messages; `getDefaultLocale()` as locale fallback in email formatting.
- **`@infrastructure/persistence/search`** — `readAll` and `MAX_CONFIGURED_PAGE_SIZE` for the unpaginated export read.
- **`@infrastructure/persistence/create-repository`** — `PaginatedResult` type for `list`.
- **`@kernel/ability`** — `heldKeys` provides the caller's literal key set for `isMintable`.
- **`@kernel/permissions`** — `findKey` resolves a key's declaration (scope, stepUp); `systemCallerContext` used by `revokeAllMintedBy`.
- **`@modules/account`** (`domain/revocation`, `index`) — `SessionsRevokedReason` type parameterises `revokeAllMintedBy` and `notifyRevoked`.
- **`@modules/api-keys/credentials`** — `mintApiKey` (key generation) and `displayIdOf` (human-readable prefix).
- **`@modules/api-keys/audit`** — `apiKeysAuditActions` constants for audit log entries.

## Notes

- **Tenant scope is guaranteed by the route guard**, not by a check here: every key in the family is `scope: tenant`, so `caller.tenantId` is always set. No platform-scope branch exists in this file.
- **`isMintable` deliberately uses `heldKeys` (literal keys)**, not `holdsKey`, because `holdsKey` collapses sibling keys (e.g. `orders.self.read` → `orders.any.read`) and would let a caller mint a broader key than they actually hold.
- **`revoke` is intentionally unranked**: any admin in the tenant can revoke any tenant key, including another admin's. The only gate is the tenant check + the key's existence.
- **Email failures never propagate.** Both `notifyMinted` and `notifyRevoked` catch and `logger.warn`; the mint/revoke itself has already committed.
- **`findOwnApiKeys` is unpaginated by design** — it serves a one-time data-export, not a client-facing listing.
- **`apiKeysDeleteByUserId` participates in the caller's Mongoose `ClientSession`**, so it rolls back if the surrounding hard-delete transaction fails.
