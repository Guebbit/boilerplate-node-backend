---
source: src/modules/account/controllers/post-2fa-method-remove.ts
generated_at: 2026-11-22T03:23:31.686144+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-method-remove.ts

## Purpose
Express controller for `POST /account/2fa/methods/{method}/remove`. It is a thin HTTP adapter over `twoFactorService.removeTwoFactorMethod`. It removes one two-factor method and leaves the others armed. After a successful removal it issues fresh tokens so the caller stays signed in.

## Key elements
- `post2faMethodRemove(request, response)` is the only export. Its flow:
  1. Reads `id` and `amr` from `request.authContext!`.
  2. Validates `request.params` with `RemoveTwoFactorMethodParams` and `request.body` with `RemoveTwoFactorMethodBody`, both through `parseBody`. A failed parse returns early.
  3. Takes a session snapshot with `sessionSnapshotOf(request, id)` before changing anything.
  4. Calls `twoFactorService.removeTwoFactorMethod(id, method, body.code, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it records a failure metric and stops.
  6. Otherwise it records a success metric, calls `remintSession(...)` with `withProofs(amr, AMR.otp)` and the snapshot, and responds `200` with `AuthTokens` via `successResponse`.
  7. Any error goes to `catchAs(response, 'post2faMethodRemove')`.

## Relationships
- `infrastructure/http/controller`: supplies `parseBody` (schema validation), `refused` (writes the refusal response from a service result) and `catchAs` (error handler).
- `infrastructure/http/request`: `callerContextOf` builds the caller context passed to the service.
- `infrastructure/http/response`: `successResponse` sends the 200 response.
- `../services` (`services/index.ts`): exports `twoFactorService`, which holds the actual business logic.
- `../session/session`: `sessionSnapshotOf` and `remintSession` capture the session state and issue new tokens after the old sessions are revoked.
- `../domain/session-proof`: provides `withProofs` and `AMR`, used to add the OTP proof to the existing `amr`.
- `../metrics`: the `authTwoFactorDisableTotal` counter is incremented with `method` and `status` labels.
- `src/types`: `AuthTokens` and `TwoFactorCodeRequest` types.
- `../routes`: presumably mounts this controller. The file itself doesn't show this.
- `../session/strategy`: no direct use is visible in this file.

## Notes
- The snapshot is taken first because the removal deletes the session the request is signed in on. All sessions are revoked, including the current one, so `remintSession` is what keeps the caller logged in.
- The endpoint requires fresh critical auth plus a valid code. The reason given is that a stolen-but-fresh session must not be able to remove factors one at a time.
- It reuses the `authTwoFactorDisableTotal` metric, which is also used for the full 2FA disable. Success and failure are distinguished by the `status` label.
- A body validation failure increments the failure metric. A path parameter validation failure does not.
- The "fresh critical auth" requirement is not enforced in this file. It must come from elsewhere, such as routing or middleware.
