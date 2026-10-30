---
source: src/modules/account/services/oauth.ts
sha256: 34c3a7e80427dfde75a2fd88bf62d88e0b711640890f9ec262c1f7e0a3f8f3e9
generated_at: 2026-10-29T02:41:56.942226+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Implements the OAuth login/signup flow — the OAuth counterpart to the standard `login` and `signup` services. Sits one layer above the provider mechanics in `../oauth/` and decides among three outcomes for an inbound identity: log in an already-linked account, refuse an email that matches an existing account (linking requires a signed-in session), or sign up a fresh password-less user. Also provides the two-step provider-linking path (`startOAuthLink` → `linkProviderToSignedInAccount`) for connecting a provider to a currently signed-in account.

## Key elements

- **`OAuthEmailUnverifiedError`** — thrown when the provider's asserted email matches an existing account but the provider does not claim that address as verified; prevents account takeover via an OAuth app registered under a victim's address.
- **`OAuthAccountUnverifiedError`** — thrown when the matched account never proved its own address via password reset; prevents a "squatter" account from being landed on.
- **`OAuthAccountUnavailableError`** — thrown when the matched account is banned or soft-deleted; refused before any write.
- **`OAuthAccountExistsError`** — thrown when the email matches an existing verified account but no signed-in session is present (NIST SP 800-63C-4 §3.8.1: linking requires authenticated session).
- **`OAuthIdentityTakenError`** — thrown when the provider identity already belongs to a different account.
- **`OAuthLinkExpiredError`** — thrown when the link token is missing, spent, expired, or the session user doesn't match the token's owner.
- **`startOAuthLink(userId)`** — issues a short-lived `oauth-link` token for the signed-in account; caller stores it as a cookie beside state/verifier.
- **`linkProviderToSignedInAccount(linkToken, sessionUserId, provider, identity, context)`** — redeems the token, validates the session, checks the identity isn't already owned elsewhere, links it, records an audit entry, and sends a notification email.
- **`presentClaim(value)`** — normalizes a provider claim to `undefined` if blank/whitespace, guarding against non-conformant providers that emit `''` instead of omitting the claim.
- **`signupFromOAuth(provider, identity, context)`** — (private) rehosts the avatar image locally, then creates a fresh password-less user with `verifiedAt` set from the provider's vouching.
- **`notifySignInMethod(user, change, provider, context)`** — (private) fire-and-forget email to the account holder on link/unlink.
- **`discardAvatar(avatar, error)`** — (private) removes a rehosted avatar from the image store before rethrowing the original error.

## Relationships

- **`src/modules/account/controllers/get-oauth-callback.ts`** — the consumer of every error class above; maps each to a specific `?error=…` redirect query for the frontend.
- **`src/modules/account/oauth/providers/port.ts`** — supplies the `OAuthIdentity` type used throughout this file.
- **`src/modules/account/services/caller.ts`** — provides `recordAccountAudit`, which wraps the infrastructure audit call with account-specific context.
- **`src/modules/account/analytics.ts`** / **`src/modules/account/audit.ts`** — supply the enum constants (`accountAnalyticsEvents`, `accountAuditActions`) used in analytics/audit calls.
- **`src/modules/account/emails.ts`** — provides `greetableName`, `recipientLocale`, `signInMethodChangedEmail`, and the `SignInMethodChange` type for the notification email.
- **`src/modules/account/consent-record.ts`** — supplies `termsAcceptance` (used in the signup path, visible in the import).
- **`src/infrastructure/adapters/remote-image.ts`** — `rehostRemoteImage` downloads the provider's avatar so the account stores a local copy (no viewer IP ever hits the provider host).
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` is called by `discardAvatar` to clean up a failed rehost.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` logs non-fatal failures in the notification path.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for analytics emission.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for audit trail writes.
- **`src/infrastructure/i18n/context.ts`** — `getCurrentLocale` for locale-aware operations.
- **`src/modules/account/services/index.ts`** — barrel re-export for this module's public API.

## Notes

- **Error → redirect mapping is a contract.** Each exported error class maps to a distinct `?error=` query value the frontend already handles. Introducing a new reason code is a frontend contract change; when in doubt, reuse an existing code (e.g., a session mismatch is surfaced as `link_expired` rather than a new code).
- **`sessionUserId` check is a security guard, not just validation.** The link token rides a cookie; without the session-match check, a planted token could link a victim's provider identity to the attacker's account. The failure is deliberately surfaced as `OAuthLinkExpiredError` to avoid leaking that a session mismatch occurred.
- **Avatar is rehosted once at signup.** The stored `imageUrl` always points to the local image store, never back to the provider. `presentClaim` must be applied before the rehost to avoid storing an empty string.
- **`verifiedAt` semantics.** On OAuth signup, the provider's vouching is the entire verification story — the account is immediately a `customer`. This is distinct from the `OAuthAccountUnverifiedError` path, which applies to *existing* accounts that never proved their own address.
- **File is truncated in this snapshot.** The tail of `signupFromOAuth` and any code after it (likely the main `oauthLogin`/`oauthSignup` orchestrator) is not visible here.
