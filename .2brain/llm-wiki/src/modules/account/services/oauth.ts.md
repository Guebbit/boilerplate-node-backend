---
source: src/modules/account/services/oauth.ts
sha256: 34c3a7e80427dfde75a2fd88bf62d88e0b711640890f9ec262c1f7e0a3f8f3e9
generated_at: 2026-11-08T04:19:31.898929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/oauth.ts

## Purpose

Service layer for the OAuth login / signup / link flows. Sits one level above the provider-agnostic mechanics in `../oauth/` and is the OAuth counterpart to `login.ts` and `signup.ts`. It handles three sign-in outcomes (linked identity logs in, email match without a session is refused, new identity signs up) and a separate two-step "connect provider to signed-in account" flow, emitting audit records, analytics events, and notification mail along the way.

## Key elements

- **Error classes** (all exported, each maps to a specific `?error=` query param in the callback controller):
  - `OAuthEmailUnverifiedError` – provider asserted an email that matches an existing account, but the provider did not claim it as verified.
  - `OAuthAccountUnverifiedError` – matched account never proved its own address via password reset.
  - `OAuthAccountUnavailableError` – matched account is banned or soft-deleted.
  - `OAuthAccountExistsError` – email matches an existing verified account but no signed-in session is present (NIST SP 800-63C-4 §3.8.1 requirement).
  - `OAuthIdentityTakenError` – provider identity already linked to a different account.
  - `OAuthLinkExpiredError` – link token missing, spent, expired, or session mismatch.
- **`startOAuthLink(userId)`** – mints a short-lived `oauth-link` token (via `issueToken`) that the callback redeems to identify which account is connecting.
- **`linkProviderToSignedInAccount(linkToken, sessionUserId, provider, identity, context)`** – completes the connect: redeems the token, cross-checks the live session, verifies the account is authenticatable, rejects a taken identity, persists the link, records audit, and fires a notification email.
- **`presentClaim(value)`** – trims a provider claim; returns `undefined` for missing/blank/whitespace strings.
- **`notifySignInMethod(user, change, provider, context)`** – fire-and-forget email (via `sendAccountMail`) telling the owner a provider was linked or removed; logs a warning on failure, never throws.
- **`discardAvatar(avatar, error)`** – best-effort `imageStore.remove` of a re-hosted avatar, then rethrows the original error (used in the failed-signup path).
- **`signupFromOAuth(provider, identity, context)`** – (partially visible) re-hosts the avatar, creates a password-less account with `verifiedAt` set, and records terms acceptance.

## Relationships

- **`../oauth/providers/port.ts`** – imports the `OAuthIdentity` type used as the resolved-identity shape throughout.
- **`./caller.ts`** – imports `recordAccountAudit` for structured audit entries on link/signup.
- **`../analytics.ts`** – imports `accountAnalyticsEvents` as the event-name catalogue for `emitAnalyticsEvent`.
- **`../audit.ts`** – imports `accountAuditActions` as the action-name catalogue for audit rows.
- **`../consent-record.ts`** – imports `termsAcceptance` applied during `signupFromOAuth`.
- **`../emails.ts`** – imports `greetableName`, `recipientLocale`, `signInMethodChangedEmail`, and the `SignInMethodChange` type for notification mail.
- **`controllers/get-oauth-callback.ts`** – the HTTP controller that invokes the error classes and service functions here; each error class's docblock names the exact `?error=` param the controller maps to.
- **`services/index.ts`** – barrel that re-exports the public symbols of this file to consumers of the account services namespace.
- **`@infrastructure/adapters/image-store.ts`** – `imageStore.remove` for avatar cleanup on failed signup.
- **`@infrastructure/adapters/remote-image.ts`** – `rehostRemoteImage` downloads and locally stores the avatar so the provider's URL is never served to viewers.
- **`@infrastructure/adapters/logger.ts`** – `logger.warn` in the fire-and-forget notification path.
- **`@infrastructure/i18n/index.ts`** – `getCurrentLocale` for locale-aware mail/analytics.
- **`@infrastructure/observability/analytics/index.ts`** – `emitAnalyticsEvent`, `buildAnalyticsBase` for sign-in/signup/link events.
- **`@infrastructure/observability/audit.ts`** – `recordAudit` for raw audit-row writes (used alongside `recordAccountAudit` from `./caller.ts`).

## Notes

- **Two distinct "unverified" errors** are easy to confuse: `OAuthEmailUnverifiedError` is about the *provider* not claiming the email as verified; `OAuthAccountUnverifiedError` is about the *account* never completing its own password-reset verification. They guard against different attack vectors (pre-account-takeover vs. email-claim spoofing).
- **`OAuthLinkExpiredError` is overloaded**: it covers a genuinely expired/spent token *and* a session-identity mismatch (`sessionUserId !== user.id`). The code comment explains this is deliberate to avoid a new frontend error code.
- **Avatar re-hosting is fail-safe**: the remote image is downloaded once at signup time; if the account creation fails, `discardAvatar` removes the stored file before rethrowing. The account never stores the provider's original URL.
- **Notification mail is fire-and-forget**: a down mail queue logs a warning but does not fail the link or signup operation.
- **The file is truncated** in this snapshot; the full `signupFromOAuth` body (terms acceptance, analytics, audit, email) is not fully visible but is implied by the imports and the docblock.
