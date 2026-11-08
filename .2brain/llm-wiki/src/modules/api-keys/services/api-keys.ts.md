---
source: src/modules/api-keys/services/api-keys.ts
sha256: 12f29ce3704a900e2be6eeeb789b2533db11feff9841ec364a150b1e5b5de51b
generated_at: 2026-11-08T05:04:19.977237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/api-keys.ts

## Purpose

Implements the credential CRUD service layer for API keys: list, get, mint (with permission-subset validation and audit), and revoke (soft, idempotent, audited). Every operation is tenant-scoped to `context.caller.tenantId`. Also provides the unpaginated data-export query and the hard-delete hook wired into `module.ts`'s `personalData.erase` manifest.

## Key elements

- **`isMintable(id, caller)`** — Gate that a rule id may appear on a credential. Requires all five: declared in the permission catalog, `scope: tenant`, no `stepUp` tier, not marked `credential: false`, and currently held by the caller (`heldRules`).
- **`latestExpiry(now?)`** — Returns the maximum allowed `expiresAt`: one calendar year from `now` via `setFullYear` (not 365 days).
- **`notifyMinted(minterId, apiKey)`** — Fire-and-forget: resolves the minter's email/locale, formats the expiry with `Intl.DateTimeFormat` (UTC-labelled), and enqueues the "key minted" email. Catches and logs failures without propagating.
- **`findOwnApiKeys(userId)`** — Unpaginated full scan of a user's keys (newest first) for the account data-export endpoint. Metadata only; the `hash` is already stripped by the repository transform.
- **`apiKeysDeleteByUserId(userId, session)`** — Joins the caller's hard-delete transaction to remove their keys.
- **`withStatus(rows, context)`** — Enriches a page of stored rows with `status` (checks whether each *distinct* minter can still sign in) and per-row `actions` derived from the caller's own permissions.
- **`list(context, filters)`** — Paginated tenant-scoped list. Returns `{ items, meta, maxExpiresAt }`.
- **`get(id, context)`** — Single credential by id; cross-tenant access returns the same 404 as a missing id.
- **`mint(body, context)`** — Validates expiry ≤ `latestExpiry()`, validates every permission in `body.permissions` via `isMintable`, calls `mintApiKey()` for the secret/hash pair, persists, fires `notifyMinted`, records an audit event, and returns the plaintext secret (201).
- **`revoke(id, context)`** — Soft-revokes a credential. Idempotent: revoking an already-revoked key is a no-op success. Intentionally not restricted to non-admin callers (any tenant admin may revoke any tenant key).

## Relationships

- **`../credentials.ts`** — `mintApiKey()` generates the plaintext/prefix/hash triple; `displayIdOf()` formats the public prefix for emails.
- **`../audit.ts`** — Supplies `apiKeysAuditActions` enum values used in `recordAudit` calls.
- **`../emails.ts`** — `apiKeyMintedEmail` / `apiKeysRevokedEmail` build the locale-aware email subject, template, and data.
- **`../model.ts`** — Provides `ApiKeyDocument` type and the repository transform that strips `hash` from wire responses.
- **`../module.ts`** — Registers the HTTP routes that invoke `list`, `get`, `mint`, `revoke`; also hosts the `CredentialResolver` that re-checks permissions on every authenticated request.
- **`@infrastructure/http/response.ts`** — `generateSuccess`, `generateReject`, `fieldError` shape every HTTP response.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` persists audit entries on mint and revoke.
- **`@infrastructure/adapters/mailer.ts`** — `enqueueEmail` delivers the minted/revoked notification emails.
- **`@infrastructure/adapters/logger.ts`** — `logger.warn` on email-delivery failure in `notifyMinted`.
- **`@infrastructure/i18n`** (`catalog.ts`, `context.ts`) — `t()` for localized error strings; `getDefaultLocale()` as locale fallback in emails.
- **`@infrastructure/persistence/search.ts`** — `readAll` + `MAX_CONFIGURED_PAGE_SIZE` drive the unpaginated export in `findOwnApiKeys`.
- **`@kernel/ability.ts`** — `heldRules(caller)` yields the literal set of rules the caller currently holds, used by `isMintable`.
- **`@kernel/permissions.ts`** — `findRule(id)` resolves a rule id to its declaration (scope, stepUp, credential flag).

## Notes

- **Tenant isolation is structural, not checked:** every query filters on `tenant: context.caller.tenantId`; a cross-tenant `get` simply 404s rather than 403.
- **`createdByUserId` uses a non-null assertion** (`context.caller.id!`) because the route stack guarantees a live session before this code runs.
- **`latestExpiry` is a calendar year** (`setFullYear`), deliberately not `365 days`, so the contract reads naturally to humans.
- **`notifyMinted` never rejects.** A transient mail-queue outage must not turn a successful mint into an error to the caller.
- **`withStatus` deduplicates minter lookups** (`new Set(minterOf.values())`) so a page with 50 keys by 3 minters triggers 3 user queries, not 50.
- **`revoke` is intentionally permissive:** any tenant admin may revoke any tenant key, mirroring Stripe/GitHub conventions. The only gate is the route's own auth key plus the tenant match.
- **Permission validation is two-phase:** checked at mint time here, and re-checked on every subsequent request by `module.ts`'s `CredentialResolver`, so a demoted minter's existing keys lose the dropped permissions immediately.
