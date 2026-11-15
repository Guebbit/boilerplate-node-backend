---
source: src/modules/account/services/logout.ts
sha256: 3c06bc41bb1ec6a0d95e4ae0cf733dfcb7c1c624e18f21b3edac8bdec82654cb
generated_at: 2026-11-14T18:45:47.868106+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/logout.ts

## Purpose

Implements the three logout operations for the account domain: revoke a single session by ID, log out the current (cookie-bearing) session, and log out every session across all devices (advancing the session epoch so outstanding access tokens are invalidated). Each path emits the correct audit record and analytics event, with intentionally different success/failure semantics.

## Key elements

- **`SessionRevocation`** (exported interface) — Result shape for `sessionRevoke`: `{ revoked: boolean; current: boolean }`.
- **`isOwnFamily`** (private helper) — Resolves a presented credential via `sessionRepository.findByHash` and checks whether the row belongs to the given `userId` + `familyId`. Matches at the *family* level so a rotated credential still resolves to the same session.
- **`sessionRevoke`** (exported) — Revoke one session by ID. Calls `isOwnFamily` *before* the delete (the row must still exist), then `sessionRepository.removeFamily`. Records an audit row **only** when `removed > 0` to avoid logging a no-op as a success.
- **`logoutCurrentSession`** (exported) — Deletes the session the presented credential names (if any) via `sessionRepository.removeFamilyByHash`. Always records an audit row and emits an analytics event, even when no credential was supplied.
- **`logoutEverywhere`** (exported) — Looks up the user via `accountUserService.findAuthenticatableById`, calls `revokeFor('logout-all', user.id)`, and returns a `ResponseSuccess<UserDocument>` or a 401 `ResponseReject`. Catches DB errors into `rejectDatabaseEnvelope('auth', …)`. Records audit with the *actual* outcome and emits the same analytics event name as single-session logout, distinguished by `scope: 'everywhere'`.

## Relationships

- **`./revocation`** — `revokeFor` is the shared mechanism that invalidates a user's sessions and bumps the session epoch; `logoutEverywhere` delegates to it.
- **`../repository`** (`sessionRepository`) — All three functions read or delete session rows through this repository.
- **`@infrastructure/security/hash-token`** — Every credential is hashed with `hashToken` before hitting the repository; no plaintext tokens are stored or compared.
- **`@infrastructure/http/response` / `@infrastructure/http/errors`** — `logoutEverywhere` shapes its return via `generateSuccess`/`generateReject`; unexpected DB errors are wrapped by `rejectDatabaseEnvelope`.
- **`@infrastructure/observability/audit`** (`recordAudit`) and **`../audit`** (`accountAuditActions`) — Every operation writes an audit row using the action constants defined in the account module.
- **`@infrastructure/observability/analytics`** and **`../analytics`** (`accountAnalyticsEvents`) — Emits `USER_LOGGED_OUT` events; the two variants share the event name and differ only in the `scope` property.
- **`@modules/users/friends/account`** (`accountUserService`) — `logoutEverywhere` resolves the user document here.
- **`@modules/users`** — Provides the `UserDocument` type returned on success.
- **`@types`** — `CallerContext` is threaded into every audit/analytics call.

## Notes

- **Ordering matters in `sessionRevoke`:** `isOwnFamily` must run *before* `removeFamily`; once the row is deleted the credential resolves to nothing and `current` would always be false.
- **Audit is conditional in `sessionRevoke` but unconditional in the other two.** A 404-like no-op (invented ID, already-expired row) produces no audit row for `sessionRevoke`; `logoutCurrentSession` and `logoutEverywhere` always write one because the route contract returns 200 / 401 respectively.
- **401, not 404, for a missing user in `logoutEverywhere`.** The OpenAPI spec (`openapi.yaml`) declares no 404 for `logoutAll`; the caller's own session is the resource that no longer exists, so 401 is the chosen signal.
- **Shared analytics event name.** `USER_LOGGED_OUT` is used for both single-session and everywhere logouts, split by `properties.scope` (`'session'` vs `'everywhere'`). Renaming one would break any downstream funnel or rate calculation built on the single event name.
- **Cookie-only authentication.** Because the route authenticates via cookie (no bearer token), `buildAnalyticsBase` yields `distinctId: 'anonymous'`. Under PostHog these events do not attribute to a person; under Umami the visitor is still identifiable by IP + user-agent hash.
