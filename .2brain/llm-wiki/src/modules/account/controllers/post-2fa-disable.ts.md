---
source: src/modules/account/controllers/post-2fa-disable.ts
source_sha256: 53561dc45902d47635d38acbdbe744f232e9f6be46f60b4ee2dd0c9a9e4d2144
context_sha256: b0b1519e57054fe56d1dad1a707554bbcfa884845ef420f4ed083222cf7b3e4a
generated_at: 2026-11-22T03:23:16.440294+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-2fa-disable.ts

## Purpose
Express controller for `POST /account/2fa/disable`. It is a thin HTTP adapter over `twoFactorService.disableTwoFactor`: it validates the body, calls the service, records a metric, and re-issues a session so the caller stays logged in after the service revokes all sessions.

## Key elements
- **`post2faDisable(request, response)`** (the only export). Flow:
  1. Reads `id` and `amr` from `request.authContext!`.
  2. Validates the body with `parseBody(DisableTwoFactorBody, ...)`. On failure it increments `authTwoFactorDisableTotal` with `{ method: 'all', status: 'failure' }` and returns.
  3. Takes a session snapshot with `sessionSnapshotOf(request, id)` before the service call.
  4. Calls `twoFactorService.disableTwoFactor(id, parsed.code, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it counts a failure and returns.
  6. Otherwise it counts a success and calls `remintSession(request, response, id, withProofs(amr, AMR.otp), snapshot)`.
  7. Responds `200` with `successResponse<AuthTokens>(response, issued, 200)`.
  8. Any thrown error goes to `catchAs(response, 'post2faDisable')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs` for validation, refusal handling and error mapping.
- `src/infrastructure/http/response.ts`: `successResponse` builds the 200 reply.
- `src/infrastructure/http/request.ts`: `callerContextOf` extracts caller context for the service.
- `src/modules/account/services/index.ts`: exports `twoFactorService`, which this controller calls.
- `src/modules/account/session/session.ts`: `sessionSnapshotOf` and `remintSession` capture and re-issue the session.
- `src/modules/account/domain/session-proof.ts`: `withProofs` (and the `AMR` constant) extend the session's authentication methods with an OTP proof.
- `src/modules/account/metrics.ts`: `authTwoFactorDisableTotal` counter.
- `src/types/index.ts`: `AuthTokens` and `TwoFactorCodeRequest` types.
- `src/modules/account/routes.ts`: wires this controller to the route, per the graph. The route guard is referenced in the doc comment but not visible here.
- `src/modules/account/session/strategy.ts` is a graph neighbor, but this file does not reference it directly.

## Notes
- The snapshot must be taken before the service call because disabling deletes the session the request is signed in on.
- The route guard requires fresh critical auth. A valid code or backup code in the body is also required. The comment explains why: without it, a stolen-but-fresh session could disable 2FA.
- Metrics always use `method: 'all'`. Success and failure are counted, but a thrown error caught by `catchAs` is not counted in this file.
- The re-minted session carries the caller's existing `amr` plus the OTP proof.
- The body schema `DisableTwoFactorBody` is imported from `@api/schemas.zod`.
