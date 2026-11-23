---
source: src/modules/account/controllers/post-2fa-confirm.ts
source_sha256: bd34495f7810afb2959bce9bf775d389c0e640e85809ff53878f74ca7707e7d7
context_sha256: b0b1519e57054fe56d1dad1a707554bbcfa884845ef420f4ed083222cf7b3e4a
generated_at: 2026-11-22T03:23:02.934257+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose
Express controller for `POST /account/2fa/methods/{method}/confirm`. It is a thin HTTP adapter over the two-factor service's `confirmTwoFactorMethod`. It arms a pending 2FA method against a code the caller has received. It returns backup codes if this was the account's first factor. Because arming a factor revokes all sessions, it also re-issues a session for the caller.

## Key elements
- `post2faConfirm(request, response)` — the only export. Flow:
  1. Reads `id` and `amr` from `request.authContext!`.
  2. Validates `request.params` with `ConfirmTwoFactorMethodParams` and `request.body` with `ConfirmTwoFactorMethodBody`, both via `parseBody`. It returns early if validation fails.
  3. Captures a session snapshot with `sessionSnapshotOf(request, id)` before the service call.
  4. Calls `twoFactorService.confirmTwoFactorMethod(id, method, body.code, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it increments the failure metric and stops.
  6. Otherwise it increments the success metric and calls `remintSession(request, response, id, withProofs(amr, AMR.otp), snapshot)`.
  7. Finally it responds 200 via `successResponse<TwoFactorConfirmed>` with `{ ...result.data, ...issued }`.
  8. Any rejection goes to `catchAs(response, 'post2faConfirm')`.

## Relationships
- `infrastructure/http/controller` — supplies `parseBody`, `refused` and `catchAs` for validation, refusal handling and error handling.
- `infrastructure/http/request` — `callerContextOf` builds the caller context passed to the service.
- `infrastructure/http/response` — `successResponse` writes the 200 response.
- `account/services` — exports `twoFactorService`, which this controller calls; the business logic lives there.
- `account/session/session` — `sessionSnapshotOf` and `remintSession` preserve and re-issue the caller's session.
- `account/domain/session-proof` — exports `AMR` and `withProofs`, used to add the OTP proof to the existing `amr` for the new session.
- `account/metrics` — `authTwoFactorEnrollTotal` counter, labelled by `method` and `status`.
- `src/types` — `TwoFactorConfirmed` and `TwoFactorConfirmRequest` types.
- `account/routes` — the route table that wires this handler to the endpoint.

## Notes
- The snapshot must be taken before the service call, because confirming deletes the session the request is signed in on.
- A body validation failure increments the `failure` metric. A path-parameter validation failure does not.
- Refusals, such as a bad code, count as `failure`. Success is counted before the session is re-minted, so a re-mint error still leaves a `success` count.
- It relies on upstream auth middleware having populated `request.authContext` (non-null assertion).
