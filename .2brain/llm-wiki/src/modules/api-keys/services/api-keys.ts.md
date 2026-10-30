---
source: src/modules/api-keys/services/api-keys.ts
sha256: 8251339f86271f7a66a6684825819d7d0d5aa9a3cd49ae615f302c51559c9ae7
generated_at: 2026-10-29T03:14:45.022736+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Service layer for API-key (credential) CRUD: list, mint, and revoke. Enforces tenant scoping on every operation, validates that minted permissions are a subset of the minter's current holdings, records audit entries, and sends a one-time notification email to the minter. Sits between the HTTP route handlers (in `module.ts`) and the repository/presenter layers.

## Key elements

- **`isMintable(id, caller)`** – Guards whether a permission rule may be assigned to a credential. Requires the rule to be declared, tenant-scoped, free of step-up, marked credential-compatible, and currently held by the caller.
- **`latestExpiry(now?)`** – Returns one calendar year from `now` (clock injectable for tests). Used as the maximum accepted `expiresAt` at mint time.
- **`notifyMinted(minterId, apiKey)`** – Fire-and-forget email to the minter. Resolves the minter's address fresh (never stored on the key), localises the expiry date, enqueues via the mailer. Failures log a warning but never reject the mint.
- **`findOwnApiKeys(userId)`** – Unpaginated export of a user's own keys (metadata only; secret never included). Uses `readAll` with `MAX_CONFIGURED_PAGE_SIZE`.
- **`apiKeysDeleteByUserId(userId, session)`** – Hard-delete hook for `personalData.erase`; participates in the caller's transaction.
- **`withStatus(rows, context)`** – Enriches stored rows with a computed `status` (suspends keys whose minter can no longer authenticate) and per-row `actions`. Performs one distinct-minter lookup, not one per row.
- **`list(context, filters)`** – Paginated tenant-scoped listing, newest first by default. Returns `items`, `meta`, and `maxExpiresAt`.
- **`get(id, context)`** – Single-tenant credential fetch. Cross-tenant id is indistinguishable from a missing id (404).
- **`mint(body, context)`** – Validates `expiresAt` ≤ `latestExpiry` and that every requested permission passes `isMintable`. Generates the key (`mintApiKey`), persists via repository, fires notification, records audit, and returns the plaintext secret once (201).
- **`revoke(id, context)`** – Soft-revokes a credential. Idempotent: revoking an already-revoked key returns success, not 404.

## Relationships

- **`../credentials`** – `mintApiKey()` (key generation) and `displayIdOf()` (short human-readable prefix) are called during mint and email formatting.
- **`../audit`** – `apiKeysAuditActions` supplies the action identifiers passed to `recordAudit`.
- **`../emails`** – `apiKeyMintedEmail` and `apiKeysRevokedEmail` build the locale-aware email payload consumed by `enqueueEmail`.
- **`../model`** – `ApiKeyDocument` type; the repository's stored shape that the presenter (`presentApiKey`) and status helper (`apiKeyStatus`) operate on.
- **`../module`** – Registers these service functions as route handlers; the `CredentialResolver` middleware re-validates permissions on every authenticated request; the `personalData.erase` manifest calls `apiKeysDeleteByUserId`.
- **`@infrastructure/observability/audit`** – `recordAudit` records mint and revoke events.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` / `fieldError` shape all HTTP responses.
- **`@infrastructure/i18n`** – `t()` for user-facing error strings; `getDefaultLocale()` as email fallback.
- **`@infrastructure/adapters/mailer`** – `enqueueEmail` dispatches mint/revoke notifications.
- **`@infrastructure/adapters/logger`** – Warns on non-fatal email failures.
- **`@infrastructure/persistence/search`** – `readAll` and `MAX_CONFIGURED_PAGE_SIZE` power the unpaginated export.
- **`@kernel/ability`** – `heldRules(caller)` returns the exact rule set the caller's ability was built from, used in `isMintable`.
- **`@kernel/permissions`** – `findRule(id)` resolves a rule's declared scope/stepUp/credential flags; `systemCallerContext` (imported, likely used in revoke or internal paths).

## Notes

- **Cross-tenant reads are 404, not 403.** `get` and `list` treat another tenant's key as if it does not exist, avoiding key-ID enumeration.
- **The plaintext secret is returned exactly once** (in the `mint` 201 response). All subsequent reads go through `presentApiKey`, which omits the hash/secret.
- **Mint validation is two-layered.** `isMintable` checks at creation time; `module.ts`'s `CredentialResolver` re-checks on every request the key later makes, so a demoted minter cannot leave an over-privileged key behind.
- **`latestExpiry` uses `setFullYear(+1)`**, not a fixed day count, to respect leap years and calendar semantics.
- **`findOwnApiKeys` is deliberately unpaginated.** It is a one-time data-export operation, not a client-facing listing.
- **Revocation is intentionally less privileged than other admin actions** (any tenant admin may revoke any tenant key), matching the "revoking only removes access" reasoning and aligning with Stripe/GitHub conventions.
- **`notifyMinted` resolves the minter's email at send time**, never persisting it on the key document, so a later email change is reflected in future notifications.
