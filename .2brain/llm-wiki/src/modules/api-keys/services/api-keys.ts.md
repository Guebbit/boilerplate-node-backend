---
source: src/modules/api-keys/services/api-keys.ts
source_sha256: 893115d532a12f5db71f497644b842b26f1b35df6ee3f63f8e9caed67e905863
context_sha256: 826c453c7ec7b9c543cdca238e3c2eb0b0881c45d195071380a431a12e97a155
generated_at: 2026-11-22T04:23:19.899564+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/services/api-keys.ts

## Purpose
Service layer for tenant-scoped API credential CRUD: list, get, mint, and revoke. Every read and write narrows to `context.caller.tenantId`. Minting validates the requested permission subset, creates the key, emails the minter, and records an audit entry. Revocation is a soft revoke that is also audited.

## Key elements
- `latestExpiry(now?)`: the latest allowed expiry, one calendar year after `now`. The clock is injectable for tests.
- `isMintable(id, caller)` (private): a permission is mintable only if it is declared (`findRule`), `tenant`-scoped, has no `stepUp`, does not have `credential: false`, and is currently held by the minter (`heldRules(caller)`).
- `notifyMinted(minterId, apiKey)` (private): fire-and-forget email to the minter.
  - It looks up the minter fresh with `userService.getById`.
  - It formats the expiry date with `Intl.DateTimeFormat` in the user's locale, in UTC.
  - It enqueues the mail via `enqueueEmail`.
  - Failures are only logged as warnings.
- `findOwnApiKeys(userId)`: every key the user minted, newest first, as `ExportApiKey[]`, for the personal data export. It is unpaginated (`readAll`) and metadata only.
- `apiKeysDeleteByUserId(userId, session)`: the hard-delete hook for account erasure. It runs inside the caller's `ClientSession`.
- `withStatus(rows, context)` (private): adds `status` and `actions` to rows. It does one `findAuthenticatableById` lookup per distinct minter, because a minter who can't sign in suspends their keys.
- `list(context, filters)`: a paginated search of the tenant's keys. The response includes `maxExpiresAt`.
- `get(id, context)`: returns one key with its status. A missing key and another tenant's key give the same 404 (`generic.error-item-gone`).
- `mint(body, context)`: validates, then creates the key.
  - Returns 422 if `expiresAt` is more than one year out (`api-keys.expiry-too-far`).
  - Returns 422 if any permission is not mintable. The error lists the offending keys in a `permissions` field.
  - Generates the credential with `mintApiKey()`.
  - Stores `hash` and `publicPrefix`.
  - Returns 201 with the plaintext `secret`. This is the only time the secret is exposed.
  - Fires `notifyMinted` and records the audit action `ADMIN_API_KEY_MINTED`.
- A revoke function follows `mint` (idempotent; a concurrent revoke is audited once). Its body is not covered here.

## Relationships
- `../repository` (`apiKeyRepository`): persistence for search, create, find, `mintersOf` and `deleteByUserId`.
- `../credentials`: `mintApiKey` and `displayIdOf`.
- `../audit`: `apiKeysAuditActions`, passed to `@infrastructure/observability/audit` `recordAudit`.
- `../emails`: `apiKeyMintedEmail`, `apiKeysRevokedEmail` and `KeysRevokedReason` for the notification mail.
- `../model`: `ApiKeyDocument` type; its transform omits `hash` from the wire shape.
- `../presenter` and `./actions`: `apiKeyStatus`, `presentApiKey` and `actionsForRows` shape the response rows.
- `@infrastructure/adapters/mailer` (`enqueueEmail`) and `adapters/logger`: used for the notification mail and its failure warnings.
- `@infrastructure/http/response`: `generateSuccess`, `generateReject` and `fieldError` build the responses.
- `@infrastructure/i18n`: `t` for error messages and `getDefaultLocale` for the fallback locale.
- `@infrastructure/persistence/search`: `readAll` and `MAX_CONFIGURED_PAGE_SIZE`, used by the export.
- `@kernel/ability` (`heldRules`) and `@kernel/permissions` (`findRule`, `systemCallerContext`): decide which permissions a minter may grant.
- `@modules/users` (`userService`): provides the minter's email, locale and sign-in ability.

## Notes
- The tenant filter relies on `apikeys.*` rules all being `scope: tenant`, so `caller.tenantId` is always set.
- The permission subset is checked at mint time and re-checked on every request the key makes (`src/modules/api-keys/services/resolver.ts`), so a demoted minter cannot leave behind a key that reaches further than they now can.
- `mint` uses `context.caller.id!`. The route's `getAuth, isAuth` middleware guarantees a live session.
- The expiry cap (one year) is enforced at mint, not at use.
