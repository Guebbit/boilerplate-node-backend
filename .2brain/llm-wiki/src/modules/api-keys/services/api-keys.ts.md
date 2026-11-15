---
source: src/modules/api-keys/services/api-keys.ts
sha256: 9fedd0de398b846a06869588fa5e771f86094cec0987c1bf553293799db5d5c9
generated_at: 2026-11-14T19:21:38.639445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Business-logic service for tenant-scoped API-key credentials. It implements the full lifecycle—list, fetch, mint (with permission-subset validation), and soft-revoke—and sits between the route handlers and the repository, adding audit recording, user-status enrichment, and out-of-band email notification.

## Key elements

- **`isMintable(id, caller)`** *(private)* — Five-condition gate for assigning a permission rule to a credential: rule must be declared, tenant-scoped, step-up-free, credential-eligible, and currently held by the minter.
- **`latestExpiry(now?)`** — Returns one *calendar* year (via `setFullYear`) from the given clock. The upper bound any mint may accept.
- **`notifyMinted(minterId, apiKey)`** *(private)* — Fire-and-forget: resolves the minter's email/locale, formats the expiry in the recipient's locale (UTC zone named explicitly), and enqueues the "key minted" email. Failures are logged, never thrown.
- **`findOwnApiKeys(userId)`** — Unpaginated, metadata-only export of all keys a user minted (for data-export endpoints). Secret is omitted by the repository transform.
- **`apiKeysDeleteByUserId(userId, session)`** — Hard-delete hook called inside the account-deletion transaction.
- **`withStatus(rows, context)`** *(private)* — Batch-enriches stored rows: one `userService.findAuthenticatableById` call per *distinct* minter (not per row) to compute `status`, plus per-row `actions`.
- **`list(context, filters)`** — Paginated tenant key listing, newest-first by default, with computed status and `maxExpiresAt`.
- **`get(id, context)`** — Single-key fetch; cross-tenant access returns the same 404 as a missing key.
- **`mint(body, context)`** — Validates `expiresAt ≤ latestExpiry()`, filters `permissions` through `isMintable`, creates the key via the repository, fires `notifyMinted`, records an audit entry, and returns the plaintext secret once (HTTP 201).
- **`revoke(id, context)`** — Soft-delete; idempotent (already-revoked → 200, not 404). Any admin may revoke any key in the tenant.

## Relationships

- **`@infrastructure/http/response`** — All endpoints return `generateSuccess` / `generateReject` / `fieldError` envelopes.
- **`@infrastructure/i18n`** (`catalog`, `context`, `index`) — `t()` for user-facing error strings; `getDefaultLocale()` as fallback in email formatting.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers the minted-key notification.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the `ADMIN_API_KEY_MINTED` action after a successful create.
- **`@infrastructure/persistence/search`** — `readAll` + `MAX_CONFIGURED_PAGE_SIZE` drive the unpaginated export in `findOwnApiKeys`.
- **`@kernel/ability`** — `heldRules(caller)` provides the literal rule set the minter currently holds, used by `isMintable`.
- **`@kernel/permissions`** — `findRule(id)` validates that a permission string is declared in the rule registry.
- **`../credentials`** — `mintApiKey()` generates the plaintext/prefix/hash triple; `displayIdOf` formats the public prefix for display.
- **`../audit`** — `apiKeysAuditActions` supplies the audit-action constant.
- **`../emails`** — `apiKeyMintedEmail` / `apiKeysRevokedEmail` build the mail template + data.
- **`../model`** — `ApiKeyDocument` type; the Mongoose transform (`applyApiKeyTransform`) strips the hash before any row reaches this service.

## Notes

- **Tenant isolation is total.** Every query narrows on `context.caller.tenantId`; a foreign-tenant key is indistinguishable from a missing one (404).
- **Permissions are checked twice.** At mint time here, and again on every subsequent request by the `CredentialResolver` in `module.ts`. A minter demoted after minting cannot leave a key that outlives their authority.
- **`createdByUserId` is asserted non-null** (`context.caller.id!`) because the route stack guarantees a live authenticated session before this service is reached.
- **`findOwnApiKeys` is intentionally unpaginated**—it serves a one-time export, not a client-paginated listing.
- **`latestExpiry` uses calendar arithmetic** (`setFullYear(+1)`) rather than a day count, so "one year" matches what a human reader expects (handles Feb 29, leap years).
- **The plaintext secret appears exactly once** in the HTTP 201 response; it is never stored in retrievable form and is absent from `list`/`get`/`findOwnApiKeys`.
- **`revoke` is deliberately permissive:** any admin in the tenant can revoke any key (including a fellow admin's), mirroring Stripe/GitHub conventions. The tenant-scoped 404 is the sole gate.
