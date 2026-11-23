---
source: src/modules/account/services/oauth.ts
source_sha256: a3b010eed96c77e354bab6835f021009cb7c903f4f09833b55cf3409cd12a64b
context_sha256: 7cbd476c05656a2dd894996cc63b318707b3ab9b9b9cbfa45e7c393f330b6fdf
generated_at: 2026-11-22T03:38:40.256546+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/oauth.ts

## Purpose
OAuth login/signup service layer for the account module. It sits above the provider mechanics in `../oauth/` (which know nothing about `UserDocument`, audit or analytics) and is the OAuth counterpart to `login.ts` and `signup.ts`. Per the module doc, login/signup has three outcomes: an already-linked identity logs in, an email matching an existing account is refused (linking needs a signed-in session), and anything else signs up a fresh password-less user. It also owns connecting a provider to an already signed-in account.

## Key elements
- **`OAuthEmailUnverifiedError`**: the provider does not claim the email as verified, but it matches an existing account. Refused to block account takeover. The callback turns it into `?error=email_unverified`.
- **`OAuthAccountUnverifiedError`**: the existing account never proved its own address (pre-account-takeover defence). The way out is password reset (`password-reset.ts#completePasswordReset`). Maps to `?error=account_unverified`.
- **`OAuthAccountUnavailableError`**: the matched account is banned or soft-deleted. Refused before any write. The callback answers it as `provider_error`.
- **`OAuthAccountExistsError`**: the email matches a verified account but nobody is signed in. Linking requires an authenticated session (NIST SP 800-63C-4 §3.8.1). Maps to `?error=account_exists`.
- **`OAuthIdentityTakenError`**: the provider identity already belongs to another account. Maps to `?error=already_linked`.
- **`OAuthLinkExpiredError`**: the link token is missing, spent or expired, or the session does not match. Maps to `?error=link_expired`.
- **`notifySignInMethod`** (internal): fire-and-forget email telling the account holder that a sign-in provider was connected or removed. Failures are only logged as warnings.
- **`startOAuthLink(userId)`**: issues a short-lived `oauth-link` token (`OAUTH_LINK_TTL_MS`) for the signed-in account. The caller sets it as a cookie beside the state and verifier.
- **`linkProviderToSignedInAccount(linkToken, sessionUserId, provider, identity, context)`**: redeems the token and links the identity to the account that started the attempt. Steps:
  1. Find the live token.
  2. Require `sessionUserId` to match the token's user.
  3. Require the user to be authenticatable.
  4. Refuse if another account holds the identity.
  5. Spend the token and link via `accountUserService.linkOAuthAccount` in one `spendThen` transaction.
  6. Audit `AUTH_OAUTH_LINKED` and send the notification email.
  
  It is marked `@internal`.
- A helper for normalising provider claims is declared at the end of the visible content. It returns `undefined` for missing or blank values.

## Relationships
- **`src/modules/account/controllers/get-oauth-callback.ts`**: the only intended caller. It maps each error class to a redirect code and may call `linkProviderToSignedInAccount`.
- **`src/modules/account/oauth/providers/port.ts`**: supplies the `OAuthIdentity` type (`providerId` etc.).
- **`src/modules/account/services/caller.ts`**: `recordAccountAudit` writes the audit row.
- **`src/modules/account/audit.ts`** and **`src/modules/account/analytics.ts`**: `accountAuditActions` and `accountAnalyticsEvents`. Only `AUTH_OAUTH_LINKED` is used in the visible code.
- **`src/modules/account/emails.ts`**: `signInMethodChangedEmail`, `recipientLocale` and `greetableName` build the notice.
- **`src/infrastructure/persistence/mongo-errors.ts`**: `isDuplicateKey` detects a unique-index collision on link.
- **`src/infrastructure/adapters/logger.ts`**: logs notification failures.
- **Imported but not used in the visible portion**: `src/infrastructure/adapters/image-store.ts`, `src/infrastructure/adapters/remote-image.ts`, `src/infrastructure/i18n/index.ts` (`getCurrentLocale`), `src/infrastructure/observability/analytics/index.ts`, `src/infrastructure/observability/audit.ts`, and `src/modules/account/consent-record.ts` (`termsAcceptance`). These support the login/signup code in the part of the file not shown.

## Notes
- All refusals in `linkProviderToSignedInAccount` happen before the token is spent. A refused attempt leaves the token live, and the link and spend commit or roll back together.
- A session mismatch is deliberately reported as `OAuthLinkExpiredError`. The frontend has one message for it, and a new reason code would be a contract change. The token alone is not proof, because it rides a cookie.
- A race on the `users_oauth_identity` unique index is converted to `OAuthIdentityTakenError`, and the spend rolls back. If a twin request wins the spend, the result is `OAuthLinkExpiredError`.
- An account that already holds the provider stays connected, and nothing new is audited or mailed.
- The error messages include emails or ids for logs only. The callback answers with fixed codes and reveals nothing about account state.
