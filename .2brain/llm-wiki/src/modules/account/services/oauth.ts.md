---
source: src/modules/account/services/oauth.ts
sha256: 63a261f77a89adf072a3c798eaee076060d0b80ddcb577e04e3d18fd13f5a064
generated_at: 2026-11-14T18:46:30.939089+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Service layer for OAuth sign-in / sign-up and for connecting a provider to an already-signed-in account. It sits one level above the raw provider mechanics (`src/modules/account/oauth/`) and is the OAuth counterpart to `login.ts` and `signup.ts`. It enforces a strict three-outcome model for first-time sign-in (link, refuse, or create) and a two-step (`startOAuthLink` → `linkProviderToSignedInAccount`) flow for linking, with explicit error classes so the callback controller can emit precise `?error=` redirect codes.

## Key elements

- **`OAuthEmailUnverifiedError`** — Thrown when the provider's email matches an existing account but the provider did not assert the address as verified. Prevents an attacker who registered an OAuth app under a victim's email from hijacking that account.
- **`OAuthAccountUnverifiedError`** — Thrown when the matched existing account has never verified its own address. Blocks a "squatter" scenario where an attacker pre-registered the email with a password.
- **`OAuthAccountUnavailableError`** — Thrown when the matched account is banned or soft-deleted (`!isAuthenticatable`). Refused before any write so a stale link can't survive an unban.
- **`OAuthAccountExistsError`** — Thrown when the email matches an existing, verified account but no signed-in session is present. Enforces NIST SP 800-63C-4 §3.8.1 (linking requires an authenticated session).
- **`OAuthIdentityTakenError`** — Thrown when the provider identity is already linked to a different account (unique on `users_oauth_identity`).
- **`OAuthLinkExpiredError`** — Thrown when the link token is missing, spent, or the session user doesn't match the token's owner.
- **`notifySignInMethod`** *(private)* — Fire-and-forget email to the account holder when a provider is connected or removed; failures are logged, never thrown.
- **`startOAuthLink(userId)`** — Issues a short-lived `oauth-link` token (TTL via `OAUTH_LINK_TTL_MS`) for the signed-in account. The caller sets it as a cookie alongside the OAuth state/verifier.
- **`linkProviderToSignedInAccount(linkToken, sessionUserId, provider, identity, context)`** — Completes the link. Validates token liveness, session match, account status, and identity uniqueness; writes the link atomically with the token spend; records an audit row and sends the notification email. Marked `@internal` — only the callback controller should invoke it.
- **`presentClaim(value)`** — Normalises a raw provider claim: trims whitespace and collapses blank strings to `undefined` (guards against non-conformant providers that send `''`).

## Relationships

- **`src/modules/account/oauth/providers/port.ts`** — Supplies the `OAuthIdentity` type consumed by `linkProviderToSignedInAccount`.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — The sole caller of the exported error classes and `linkProviderToSignedInAccount`; translates each error into a specific `?error=` redirect parameter.
- **`src/modules/account/emails.ts`** — Provides `greetableName`, `recipientLocale`, and `signInMethodChangedEmail` used to build the sign-in-method notification mail.
- **`src/modules/account/services/caller.ts`** — Provides `recordAccountAudit`, which writes the audit row on a successful link.
- **`src/modules/account/analytics.ts`** / **`src/modules/account/audit.ts`** — Provide `accountAnalyticsEvents` and `accountAuditActions` as the vocabulary for observability calls.
- **`src/modules/account/consent-record.ts`** — Provides `termsAcceptance` used during new-user sign-up.
- **`src/infrastructure/adapters/image-store.ts`** / **`src/infrastructure/adapters/remote-image.ts`** — Provide `imageStore` and `rehostRemoteImage` to re-host a provider-supplied avatar URL into internal storage.
- **`src/infrastructure/observability/analytics/index.ts`** — Provides `emitAnalyticsEvent` and `buildAnalyticsBase` for event emission.
- **`src/infrastructure/observability/audit.ts`** — Provides `recordAudit` for the audit trail.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey` to detect the race where a twin request wins the unique-index write.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger.warn` for non-fatal notification failures.
- **`src/infrastructure/i18n/index.ts`** — Provides `getCurrentLocale` for locale-aware logging and event emission.

## Notes

- **All refusals happen before the token spend.** `linkProviderToSignedInAccount` is structured so every `throw` precedes `spendThen`; a refused attempt leaves the token live, and the link + spend commit atomically.
- **Session match is a second gate.** The link token alone is not sufficient — `sessionUserId` must equal the token's owner. A planted cookie without the correct session still fails.
- **`@internal` on `linkProviderToSignedInAccount`.** The function trusts a provider-verified identity; it is deliberately not exposed on `accountService` so only the callback controller (which performed the token exchange) can call it.
- **Fire-and-forget email.** `notifySignInMethod` uses `void … .catch(→ logger.warn)` — a mail-queue outage must not roll back a completed link.
- **`presentClaim` is a defence against non-conformant providers.** OIDC Core §5.3.2 says absent claims should be omitted, but some providers send `''`; an empty string would violate the `required` username field or store a blank avatar URL.
