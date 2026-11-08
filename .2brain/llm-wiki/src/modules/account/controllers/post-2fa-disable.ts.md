---
source: src/modules/account/controllers/post-2fa-disable.ts
sha256: 53561dc45902d47635d38acbdbe744f232e9f6be46f60b4ee2dd0c9a9e4d2144
generated_at: 2026-11-08T04:03:30.407042+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-disable.ts

## Purpose

HTTP controller for `POST /account/2fa/disable`. Validates the request body (code or backup code), delegates to `twoFactorService.disableTwoFactor`, and—because disabling 2FA revokes all sessions including the caller's—immediately remints a fresh session so the authenticated user is not logged out mid-operation.

## Key elements

- **`post2faDisable(request, response)`** — sole export; the route handler.
  1. Reads `id` and `amr` from `request.authContext` (populated by the route guard).
  2. Validates the body against the `DisableTwoFactorBody` Zod schema via `parseBody`.
  3. Captures a session snapshot (`sessionSnapshotOf`) **before** calling the service, because the disable call will revoke the very session the request rides on.
  4. Calls `twoFactorService.disableTwoFactor(id, code, callerContext)`.
  5. On success, remints a session via `remintSession` with an `AMR.otp` proof added, then returns the new `AuthTokens` in a 200 response.
  6. Records `authTwoFactorDisableTotal` metric (`success` / `failure`) on every path.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/controller.ts` | Source of `parseBody`, `refused`, `catchAs` helpers. |
| `infrastructure/http/request.ts` | Provides `callerContextOf` (IP / user-agent context passed to the service). |
| `infrastructure/http/response.ts` | Provides `successResponse` for the 200 reply. |
| `modules/account/services/index.ts` | Exports `twoFactorService`, whose `disableTwoFactor` method performs the actual 2FA teardown. |
| `modules/account/session/session.ts` | Provides `sessionSnapshotOf` (pre-disable capture) and `remintSession` (post-disable re-auth). |
| `modules/account/domain/session-proof.ts` | Supplies the `AMR.otp` constant and `withProofs` to stamp the remitted session. |
| `modules/account/metrics.ts` | Exports `authTwoFactorDisableTotal` Counter. |
| `modules/account/routes.ts` | Registers this handler on the `POST /account/2fa/disable` route (with its auth guard). |
| `types/index.ts` | Type definitions for `AuthTokens` and `TwoFactorCodeRequest` used in the handler signature and response. |

## Notes

- **Order matters:** `sessionSnapshotOf` is called *before* `disableTwoFactor`. The comment in the source makes explicit that the disable call destroys the current session; the snapshot is what `remintSession` uses to re-establish it.
- **`request.authContext!`** uses a non-null assertion. The route guard is expected to have populated it; the controller does not handle the `undefined` case itself.
- **Metrics label** is hard-coded to `method: 'all'` — there is no per-code-type breakdown in this file.
- The route guard enforces "fresh critical auth"; this controller adds the additional requirement that a valid TOTP or backup code be present in the body. Both layers are needed to prevent a stolen-but-still-valid session from silently removing 2FA.
