---
source: src/modules/account/tests/integration/oauth-link.test.ts
sha256: 4142ee0b2323eaaee774d4d02901e054553b89f6ae6c5fe746760a7afe8c16dc
generated_at: 2026-10-29T02:57:30.639672+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose

Integration tests for the OAuth callback service (`loginOrCreateFromOAuth`) and the signed-in connect flow (`linkProviderToSignedInAccount`). Because these paths touch the real database (identity lookup, `$push` linking, user creation), they live in `tests/integration` rather than alongside the pure provider logic in `tests/unit`. The suite verifies find-or-create semantics, email-verification enforcement, token lifecycle, and security edge cases (account takeover, replay, cross-identity linking).

## Key elements

- **`loginOrCreateFromOAuth` — case 1 (already-linked identity):** Asserts the existing account is resolved with `outcome: 'login'`, no new user is created, and **no** audit or analytics event is emitted (that is the controller's job).
- **`loginOrCreateFromOAuth` — case 2 (email matches but not linked):** Asserts `OAuthAccountExistsError` for verified-email collisions, `OAuthEmailUnverifiedError` when the provider doesn't vouch, and `OAuthAccountUnverifiedError` for squatted/unproven accounts. Each case confirms the account is left byte-for-byte unchanged (no link, no `verifiedAt` promotion).
- **`startOAuthLink` / `linkProviderToSignedInAccount`:** Verifies the 5-minute token TTL, that the link is stored on the initiating account regardless of provider email, that the owner is mailed (no URL in the body), that the token is single-use (replay → `OAuthLinkExpiredError`), and that a mismatched signed-in user is refused.
- **`identity(overrides?)`** — local helper that builds a default `OAuthIdentity` fixture (verified, `subject-1`).
- **`oauthAccountsOf(userId)`** — reads `oauthAccounts` via `findByIdWithCredentials` because the field is `select: false` on the schema.
- **`connecting(overrides?)`** — creates a verified user and calls `startOAuthLink`, returning `{ user, token }`.
- **`mockOutbox`** — module-level array populated by the mocked `enqueueEmail`; cleared in `beforeEach`.
- **Mocks (replaced, not spied):** `audit`, `analytics`, `rehostRemoteImage`, `mailer` — all replaced via `jest.mock` with the `tests/support/ports.ts` replacement pattern.

## Relationships

- **`src/modules/account/services/oauth.ts`** — the system under test; all exported service functions and error classes are exercised here.
- **`src/modules/account/audit.ts`** — `accountAuditActions` enum values are asserted in audit-spy expectations.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` is imported for event-name assertions.
- **`src/modules/account/oauth/providers/port.ts`** — `OAuthIdentity` type shapes the `identity()` fixture.
- **`src/modules/account/tests/factories.ts`** — provides `tokenRowsOf` for inspecting `oauth-link` token rows.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `userRepository` create/inspect real user documents.
- **`src/infrastructure/observability/audit.ts`** & **`analytics/index.ts`** — fully replaced with port mocks to observe (not intercept) emission.
- **`src/infrastructure/adapters/remote-image.ts`** — `rehostRemoteImage` stubbed to `undefined` (network side is out of scope).
- **`tests/support/ports.ts`** — `observePort` and `auditPortMock` implement the replace-not-spy pattern.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for every service call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real test database before the suite runs.

## Notes

- The login branch (case 1) **deliberately emits no audit or analytics event**. The comment explains that a correct emission requires the account's real role (admin vs. user) and increments `authLoginTotal`, both of which are controller-level concerns. Asserting `not.toHaveBeenCalled()` here is intentional, not an omission.
- `oauthAccounts` is `select: false` on the Mongoose schema; a plain `findById` will never return it. Use `findByIdWithCredentials` (as `oauthAccountsOf` does) or the query will silently return `undefined`.
- The token is **single-use**: the first successful `linkProviderToSignedInAccount` call spends it; a second call with the same token rejects with `OAuthLinkExpiredError` and does not create a second link row.
- The mailer mock pushes into `mockOutbox` (module scope, not `jest.fn()` closure) so assertions can filter by template after the awaited call resolves.
