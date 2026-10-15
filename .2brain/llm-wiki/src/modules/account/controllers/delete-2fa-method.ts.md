---
source: src/modules/account/controllers/delete-2fa-method.ts
sha256: 1339e8cd0827949816583761902b840f063f20da7eb599e4374ab095558bdedb
generated_at: 2026-10-15T09:53:06.174280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa-method.ts

## Purpose
Thin HTTP adapter for `DELETE /account/2fa/methods/{method}`. It validates the request, delegates to `twoFactorService.removeTwoFactorMethod`, remints the caller's session (since removal revokes all sessions), and returns the updated auth tokens.

## Key elements
- **`delete2faMethod`** — sole export; the Express handler for the endpoint. Performs:
  - Path-param and body validation via Zod schemas (`RemoveTwoFactorMethodParams`, `RemoveTwoFactorMethodBody`).
  - Delegation to `twoFactorService.removeTwoFactorMethod(id, method, code, callerContext)`.
  - On success, remints the session with the snapshot taken *before* deletion and extended AMR proof (`AMR.otp`).
  - Emits `authTwoFactorDisableTotal` metric on both success and failure paths.

## Relationships
- **`src/modules/account/services/index.ts`** — imports `twoFactorService` to perform the actual method removal.
- **`src/modules/account/session/session.ts`** — imports `sessionSnapshotOf` (captures session state before revocation) and `remintSession` (re-issues tokens post-deletion).
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR` and `withProofs` to stamp the `otp` proof onto the remitted session.
- **`src/modules/account/metrics.ts`** — imports `authTwoFactorDisableTotal` counter (shared with the full-disable endpoint).
- **`src/infrastructure/http/controller.ts`** — imports `rejectValidation`, `refused`, `catchAs` for unified error handling.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to extract IP/UA for the service call.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` for the final 200 reply.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for the localized "method-removed" message.
- **`src/types/index.ts`** — imports `AuthTokens` and `TwoFactorCodeRequest` types.
- **`src/modules/account/routes.ts`** — registers this handler on the `DELETE /account/2fa/methods/:method` route.

## Notes
- The session snapshot is captured **before** calling the service because `removeTwoFactorMethod` revokes *all* sessions, including the one handling this request.
- The metric label is `authTwoFactorDisableTotal` (same as full disable), not a per-method variant.
- On validation failure the method label in the metric comes from `pathParameters.data.method` (path) rather than the body, since the body may be unparseable.
- The remitted session carries `withProofs(amr, AMR.otp)`, signalling to downstream strategy logic that an OTP was just verified in this request.
