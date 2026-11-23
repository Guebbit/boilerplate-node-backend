---
source: src/modules/account/services/logout.ts
source_sha256: 9cac88ed81f9e213aa4ee3aeb0864c7ac840f13a4ce9092fe808071e18292c6f
context_sha256: 95a2991c9910a8957ddc9285350579a221dd602df0ff3a93dfd5156c09f65aac
generated_at: 2026-11-22T03:38:05.861309+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/logout.ts

## Purpose
Implements the account module's deliberate session-ending operations: revoking one of the caller's own sessions, logging out of the current session, and logging out everywhere. Each operation also records an audit entry and, where applicable, an analytics event.

## Key elements
- **`SessionRevocation`** (interface): result of revoking a session. `revoked` means a session matched and was removed. `current` means the removed session was the one the caller's credential names.
- **`isOwnFamily`** (internal): checks whether a credential belongs to a given user and session family. It hashes the credential and looks it up with `sessionRepository.findByHash`. It matches by family rather than by row, so a `jwt` cookie one rotation behind still counts.
- **`sessionRevoke(userId, sessionId, credential, context)`**: calls `isOwnFamily` first, because after the delete the credential names nothing. It then calls `sessionRepository.removeFamily`. It records `AUTH_SESSION_REVOKED` in the audit only if something was actually removed. Returns `{ revoked, current }`.
- **`logoutCurrentSession(credential, context)`**: removes the family named by the credential via `removeFamilyByHash(hashToken(credential))`. A missing credential is not a failure and nothing is removed. It always records `AUTH_LOGGED_OUT` and emits `USER_LOGGED_OUT` with `scope: 'session'`.
- **`logoutEverywhere(userId, context)`**: looks up the user with `accountUserService.findAuthenticatableById`.
  - No user gives `generateReject(401, [])`.
  - Otherwise it calls `revokeFor('logout-all', user.id)` and returns `generateSuccess(user)`.
  - Errors are mapped through `rejectDatabaseEnvelope('auth', error)`.
  - It records `AUTH_LOGGED_OUT_EVERYWHERE` with outcome `success` or `failure`, and emits `USER_LOGGED_OUT` with `scope: 'everywhere'`.

## Relationships
- **`./revocation`**: `revokeFor('logout-all', …)` performs the revocation for logout-everywhere. Per the doc comment, this removes every session and moves the session epoch.
- **`../repository`**: `sessionRepository` provides `findByHash`, `removeFamily` and `removeFamilyByHash`.
- **`@infrastructure/security/hash-token`**: `hashToken` hashes credentials before lookup or removal.
- **`@infrastructure/http/response`** and **`@infrastructure/http/errors`**: build the success and reject envelopes and the database-error envelope.
- **`@modules/users/friends/account`** and **`@modules/users`**: `accountUserService` looks up the user, and `UserDocument` types the success payload.
- **`@infrastructure/observability/audit`** with **`../audit`**: `recordAudit` plus the `accountAuditActions` constants.
- **`@infrastructure/observability/analytics`** with **`../analytics`**: `emitAnalyticsEvent`, `buildAnalyticsBase` and the `accountAnalyticsEvents` constants.
- **`@types`**: `CallerContext`.

## Notes
- `sessionRevoke` skips the audit row when nothing matched. A foreign or stale session returns the same 404 as an invented id, so an audit entry would misrepresent a revoke that never happened.
- `logoutCurrentSession` authenticates by cookie alone, so the analytics `distinctId` falls back to `'anonymous'`. Under PostHog these events do not attribute to a person. Under Umami the visitor is still separated by an IP and user-agent hash.
- Both logout variants share the `USER_LOGGED_OUT` event name and differ only by `scope`. This keeps one funnel for logout counts.
- A missing user in `logoutEverywhere` returns 401 rather than 404, because `openapi.yaml` declares no 404 for `logoutAll`.
- `logoutEverywhere` emits the analytics event whether the result succeeded or failed.
- `logoutEverywhere` signs the caller out too, deliberately.
