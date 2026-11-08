---
source: src/modules/account/services/logout.ts
sha256: d4fb7678480b5e0859e8295279060965a7c1b21469f2a59571a979563c43e6c6
generated_at: 2026-11-08T04:18:53.586020+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/logout.ts

## Purpose

Implements the three logout operations an account can perform: revoke a specific session the caller owns, sign out of only the current session (cookie-based), and revoke every session plus invalidate the session epoch so outstanding access tokens die. Each operation is accompanied by an audit record and an analytics event.

## Key elements

- **`SessionRevocation`** (interface) — result shape for `sessionRevoke`: whether a row was actually removed (`revoked`) and whether it was the caller's own session (`current`).
- **`isOwnFamily`** (private helper) — hashes the presented credential, looks it up in the session repository, and checks that the row's `userId` and `familyId` match. Must run *before* the delete because the row no longer exists afterwards.
- **`sessionRevoke(userId, sessionId, credential, context)`** — reads the "own family" flag, then calls `sessionRepository.removeFamily`. Emits `AUTH_SESSION_REVOKED` audit only when `removed > 0` to avoid recording a phantom revocation.
- **`logoutCurrentSession(credential, context)`** — if a credential is present, deletes its session family by hash; otherwise is a no-op. Always records `AUTH_LOGGED_OUT` audit and fires the `USER_LOGGED_OUT` analytics event with `scope: 'session'`.
- **`logoutEverywhere(userId, context)`** — resolves the user via `userService.findAuthenticatableById`, returns 401 if the user is gone, otherwise delegates to `revokeFor('logout-all', …)`. Returns a typed `ResponseSuccess<UserDocument> | ResponseReject`. Records `AUTH_LOGGED_OUT_EVERYWHERE` audit with the real outcome and fires the same `USER_LOGGED_OUT` event with `scope: 'everywhere'`.

## Relationships

- **`src/modules/account/services/revocation.ts`** — `logoutEverywhere` calls `revokeFor` to perform the full session-epoch rotation.
- **`src/modules/account/repository.ts`** — `sessionRevoke` and `logoutCurrentSession` call `sessionRepository.removeFamily` / `removeFamilyByHash`; `isOwnFamily` calls `findByHash`.
- **`src/modules/users/index.ts`** (and its `model.ts` / `services/index.ts`) — `logoutEverywhere` fetches the user document via `userService.findAuthenticatableById` and returns it in the success envelope.
- **`src/infrastructure/security/hash-token.ts`** — every credential passed by a caller is hashed with `hashToken` before hitting the repository.
- **`src/infrastructure/http/response.ts`** — `logoutEverywhere` builds its return value with `generateSuccess` / `generateReject`.
- **`src/infrastructure/http/errors.ts`** — database failures in `logoutEverywhere` are wrapped by `rejectDatabaseEnvelope('auth', error)`.
- **`src/infrastructure/observability/audit.ts`** — all three functions call `recordAudit` with actions from `accountAuditActions`.
- **`src/infrastructure/observability/analytics/index.ts`** — `logoutCurrentSession` and `logoutEverywhere` fire events via `emitAnalyticsEvent` + `buildAnalyticsBase`.
- **`src/modules/account/analytics.ts` / `src/modules/account/audit.ts`** — provide the enum constants (`accountAnalyticsEvents`, `accountAuditActions`) used in audit and analytics calls.
- **`src/types/auth-context.ts`** — `CallerContext` is threaded through every public function as the authenticated-caller envelope.
- **`src/modules/account/services/index.ts`** — barrel that re-exports this module's public API.

## Notes

- **Audit-only-on-success for `sessionRevoke`:** `removeFamily` returns `removed = 0` both for a stale/foreign session id and a genuinely absent one; recording an audit row in that case would fabricate a security event.
- **Same analytics event name, different `scope`:** `logoutCurrentSession` and `logoutEverywhere` both emit `USER_LOGGED_OUT` but are distinguished by `properties.scope` (`'session'` vs `'everywhere'`). Splitting them into two event names would break any single-funnel rate built on `USER_LOGGED_OUT`.
- **401, not 404, for a missing user in `logoutEverywhere`:** the OpenAPI spec (`openapi.yaml`) declares no 404 for the `logoutAll` route; semantically the caller's own session is what no longer exists, so 401 is the correct signal.
- **Anonymous analytics attribution:** `logoutCurrentSession` is cookie-authenticated only, so `distinctId` falls back to `'anonymous'`. Under Umami the visitor is still separable via IP + UA hash; under PostHog those rows do not attribute to a person.
- **`isOwnFamily` must run before the delete:** after `removeFamily` the credential's row is gone, so the lookup would always miss.
