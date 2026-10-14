---
source: src/modules/account/services/logout.ts
sha256: d4fb7678480b5e0859e8295279060965a7c1b21469f2a59571a979563c43e6c6
generated_at: 2026-10-14T14:37:59.113537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/logout.ts

## Purpose

Implements the three session-termination actions an account can trigger: revoke one specific session, log out of only the current (cookie-backed) session, and log out everywhere (all sessions + epoch bump). Each action wires the repository mutation into the appropriate audit and analytics side-effects.

## Key elements

- **`SessionRevocation`** (interface) — result shape for a single-session revoke: `{ revoked: boolean; current: boolean }`. `current` tells the caller whether the revoked row was the one the request's own credential names, so the HTTP layer knows whether to clear cookies.
- **`isOwnFamily`** (private helper) — hashes the caller's credential, looks it up in `sessionRepository`, and checks that the resulting row belongs to the same `userId` + `familyId`. Matches by *family* (rotation group), not by individual row.
- **`sessionRevoke(userId, sessionId, credential, context)`** — removes one session family. Reads the "is this my own?" check **before** the delete (post-delete the credential resolves to nothing). Emits `AUTH_SESSION_REVOKED` audit only when `removed > 0`.
- **`logoutCurrentSession(credential, context)`** — deletes the family the cookie names (if any) and *always* records `AUTH_LOGGED_OUT` audit + `USER_LOGGED_OUT` analytics (scope `'session'`), even when no cookie was present.
- **`logoutEverywhere(userId, context)`** — fetches the user via `userService`, calls `revokeFor('logout-all', …)` (which also advances the session epoch), returns a `ResponseSuccess`/`ResponseReject` envelope. Returns **401** (not 404) when the user is gone, matching `openapi.yaml`. Records `AUTH_LOGGED_OUT_EVERYWHERE` audit and the same `USER_LOGGED_OUT` analytics event with scope `'everywhere'`.

## Relationships

- **`./revocation`** — `logoutEverywhere` delegates the full teardown (all sessions + epoch bump) to `revokeFor`.
- **`../repository`** — `sessionRepository.findByHash`, `removeFamily`, and `removeFamilyByHash` perform the actual row reads and deletes.
- **`@infrastructure/security/hash-token`** — `hashToken` is used to turn a raw credential into the value stored in the session table.
- **`@infrastructure/http/response` / `@infrastructure/http/errors`** — provide the `generateSuccess`/`generateReject` envelopes and the `rejectDatabaseEnvelope` catch-all for `logoutEverywhere`.
- **`@modules/users`** — `userService.findAuthenticatableById` supplies the user document for the "log out everywhere" response; `UserDocument` is the success payload type.
- **`@types` (auth-context)** — `CallerContext` carries the IP, user-agent, and optional bearer needed for audit and analytics attribution.
- **`@infrastructure/observability/analytics` / `audit`** — all three functions call `recordAudit` and `emitAnalyticsEvent` with module-specific event/action constants.
- **`../analytics` / `../audit`** — supply the `accountAnalyticsEvents` and `accountAuditActions` constant maps used as the `event` / `action` fields.
- **`./index.ts`** — re-exports the three public functions for the rest of the account module.

## Notes

- **Ordering matters in `sessionRevoke`:** `isOwnFamily` is resolved *before* `removeFamily` runs. After the delete the credential hash no longer resolves, so the check would always return `false`.
- **Audit is conditional on success in `sessionRevoke`** but **unconditional in `logoutCurrentSession`.** A missing cookie is treated as a no-op success (HTTP 200), so the audit row still fires with `outcome: 'success'`.
- **Analytics event name is shared:** both `logoutCurrentSession` and `logoutEverywhere` emit `USER_LOGGED_OUT`; they are disambiguated solely by the `scope` property (`'session'` vs `'everywhere'`). Do not rename one — rate/funnel definitions depend on the single event name.
- **401 vs 404 in `logoutEverywhere`:** the OpenAPI spec declares no 404 for this route, so a missing user is reported as 401. This is intentional and should not be "fixed" to 404 without updating the spec.
- **`isOwnFamily` matches by `familyId`, not row ID.** A JWT cookie one rotation behind still belongs to the same session family and will be flagged as `current: true`.
