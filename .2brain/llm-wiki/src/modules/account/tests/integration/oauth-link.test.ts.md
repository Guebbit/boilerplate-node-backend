---
source: src/modules/account/tests/integration/oauth-link.test.ts
sha256: 5d7046211ddfdc7a5e0bcff983f7bbad19d8dae3aca011e1f01cd611f9d65a93
generated_at: 2026-10-14T09:11:16.479092+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/oauth-link.test.ts

## Purpose

Integration tests for `loginOrCreateFromOAuth` (the find-or-create-link triad in `services/oauth.ts`). Because the function performs a real identity lookup, a `$push` link, and a user insert, it lives here rather than in the unit-test folder. The suite covers all three outcome branches (login, link, signup) plus the security guard-rails (unverified email, account takeover, banned/soft-deleted refusal, idempotent re-link).

## Key elements

- **`identity(overrides?)`** — factory that returns a default `OAuthIdentity` (verified email, `providerId: 'subject-1'`); every test starts from this and selectively overrides fields.
- **`oauthAccountsOf(userId)`** — helper that reads `oauthAccounts` via `findByIdWithCredentials` because the field is `select: false` on the schema and invisible to a plain read.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces `emitAuditEvent` with a jest fn *and* re-wraps `recordAudit` so it funnels through that same fn (the real `recordAudit` closes over its own module's `emitAuditEvent`, which a plain spy wouldn't intercept).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces `emitAnalyticsEvent` with a jest fn.
- **`jest.mock('@infrastructure/adapters/remote-image', …)`** — stubs `rehostRemoteImage` to resolve `undefined`, isolating the signup logic from network I/O.
- **`describe` blocks (5)** — one per scenario: already-linked login; verified-email link (including 2FA-armed and unverified-email rejections); banned/soft-deleted refusal; idempotent re-link; fresh signup.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/oauth.ts` | System under test — imports `loginOrCreateFromOAuth`, `presentClaim`, and the three error classes. |
| `src/modules/account/oauth/providers/port.ts` | Type-only import of `OAuthIdentity` used by the `identity()` helper. |
| `src/modules/account/audit.ts` | Imports `accountAuditActions` enum to assert on the exact action name in audit payloads. |
| `src/modules/account/analytics.ts` | Imports `accountAnalyticsEvents` enum to assert on the signup analytics event name. |
| `src/modules/users/tests/factories.ts` | Supplies `createUser` (fixture) and `userRepository` (link / count / findById helpers). |
| `src/infrastructure/observability/audit.ts` | Mocked at module level; spied on via `observePort`. |
| `src/infrastructure/observability/analytics/index.ts` | Mocked at module level; spied on via `observePort`. |
| `src/infrastructure/adapters/remote-image.ts` | Mocked so the avatar rehost step resolves without network. |
| `tests/support/callers.ts` | Provides `testCallerContext` passed as the caller argument to the SUT. |
| `tests/support/ports.ts` | Provides `observePort` — the replacement-based spy mechanism that works with the module-level mocks above. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` seeds the in-memory Mongo used by every test in the file. |

## Notes

- **Why "replaced, not spied on":** `observePort` (from `tests/support/ports.ts`) works by asserting against the *replacement* function, not by wrapping the original. The audit mock additionally re-wires `recordAudit` → `emitAuditEvent` because `recordAudit` closes over its own module-scope reference, making a simple `jest.spyOn` on `emitAuditEvent` blind to calls routed through `recordAudit`.
- **Login branch emits no audit/analytics:** By design, the login outcome defers to the controller (`get-oauth-callback.ts`) to call `recordLoginSuccess` with the account's *real* role. The service layer intentionally emits nothing here to avoid hardcoding `actorRole: 'user'`.
- **`presentClaim` is imported** but the visible test body does not exercise it directly; it is likely covered in the truncated tail of the file (e.g., a `describe` block for claim presentation).
- **Security invariant tested explicitly:** linking is refused when *either* the provider email is unverified *or* the target account has never proved the address (`verifiedAt` is null). A refusal must leave the account's `verifiedAt` unchanged (no implicit promotion).
