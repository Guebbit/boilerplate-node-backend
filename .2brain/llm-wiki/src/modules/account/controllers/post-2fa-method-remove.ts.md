---
source: src/modules/account/controllers/post-2fa-method-remove.ts
sha256: bcfbc26b449f1f6483b5a9a25ccf7f466c2c5c5b2d28ecf9de4872586824fc6c
generated_at: 2026-10-29T02:28:44.382770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-method-remove.ts

## Purpose

HTTP controller for `POST /account/2fa/methods/{method}/remove`. Removes a single 2FA method while leaving the remaining factors armed. Requires both a critical-auth session and a valid one-time code (same security bar as full 2FA disable) so a stolen-but-fresh session cannot strip factors individually.

## Key elements

- **`post2faMethodRemove`** — The sole export. Express handler that:
  1. Reads `id` and `amr` from `request.authContext` (set by upstream auth middleware).
  2. Validates path params (`method`) and body (`code`) via `parseBody` + Zod schemas.
  3. Captures a **session snapshot** (`sessionSnapshotOf`) *before* the destructive call.
  4. Calls `twoFactorService.removeTwoFactorMethod(id, method, body.code, callerContext)`.
  5. On success, **remints** the session (the removal revoked all sessions, including the current one) and returns fresh `AuthTokens` with the original AMR plus `AMR.otp` proof.
  6. Increments `authTwoFactorDisableTotal` with `method` and `status: 'success' | 'failure'` labels.
  7. Catches unexpected errors via `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/controller.ts` | Imports `parseBody`, `refused`, `catchAs` for validation, business-error handling, and top-level error capture. |
| `infrastructure/http/request.ts` | Imports `callerContextOf` to extract IP/UA context forwarded to the service. |
| `infrastructure/http/response.ts` | Imports `successResponse` to emit the 200 JSON body. |
| `account/services/index.ts` | Imports `twoFactorService.removeTwoFactorMethod` — the domain operation this adapter wraps. |
| `account/session/session.ts` | Imports `sessionSnapshotOf` (pre-removal state) and `remintSession` (post-removal reissue). |
| `account/domain/session-proof.ts` | Imports `AMR` and `withProofs` to carry the OTP auth-method-reference into the reminted session. |
| `account/metrics.ts` | Imports `authTwoFactorDisableTotal` counter. |
| `types/index.ts` | Imports `AuthTokens` and `TwoFactorCodeRequest` as type-only references. |
| `account/routes.ts` | Registers this handler on the router (graph edge; no import here). |

## Notes

- **Shared metric name.** This endpoint increments `authTwoFactorDisableTotal` (the same counter used by the full-disable endpoint), labelled only by `method` and `status`. Dashboards that split "disable" from "remove" must filter on the method label, not on a separate metric.
- **Snapshot-then-remint ordering is critical.** The snapshot is taken *before* `removeTwoFactorMethod` runs because that call revokes every session for the user, including the one carrying this request. Without the pre-captured snapshot, `remintSession` would have no baseline to restore.
- **`request.authContext!`** uses a non-null assertion, relying on the route-level auth middleware to have populated it; there is no fallback or guard in this file.
