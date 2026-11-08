---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: bd34495f7810afb2959bce9bf775d389c0e640e85809ff53878f74ca7707e7d7
generated_at: 2026-11-08T04:03:17.514923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/confirm`. Validates path params and body against Zod schemas, delegates to `twoFactorService.confirmTwoFactorMethod`, remints the caller's session (since confirming a factor revokes all existing sessions), and returns the confirmation payload (which may include backup codes for the account's first factor).

## Key elements

- **`post2faConfirm`** — the sole exported handler. Reads `id` and `amr` from `request.authContext`, parses `method` from params and `code` from body, calls the service, remints the session, and responds with `200` or an appropriate error. No other public symbols are exported.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation of params/body), `refused` (service-rejection → HTTP error), and `catchAs` (unified error catch).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to forward IP/user-agent metadata into the service call.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the 200 reply.
- **`src/modules/account/services/index.ts`** — provides `twoFactorService.confirmTwoFactorMethod`, the core business logic.
- **`src/modules/account/session/session.ts`** — provides `sessionSnapshotOf` (capture session before revocation) and `remintSession` (issue a fresh session after the factor is armed).
- **`src/modules/account/domain/session-proof.ts`** — provides the `AMR.otp` constant and `withProofs` to stamp the new session with an OTP proof.
- **`src/modules/account/metrics.ts`** — provides the `authTwoFactorEnrollTotal` counter, incremented on both success and failure paths, labelled by `method`.
- **`src/types/index.ts`** — provides the `TwoFactorConfirmRequest` and `TwoFactorConfirmed` types used for request/response shape.
- **`src/modules/account/routes.ts`** — registers this handler at the route path (graph neighbor; the controller is mounted there).

## Notes

- **Ordering is critical:** `sessionSnapshotOf` is called *before* `confirmTwoFactorMethod` because the confirm operation revokes all sessions, including the one the request is riding on. The snapshot is then passed to `remintSession` to re-establish the caller. Swapping the two calls would log the user out.
- `withProofs(amr, AMR.otp)` appends an OTP authentication-method proof to the remitted session, signalling that the user has just completed a 2FA step.
- On success the response body is `{ ...result.data, ...issued }` — i.e., service data (potentially backup codes for a first-factor enrollment) merged with the new session credentials.
- Both failure paths (schema rejection and service refusal) increment the `failure` counter; only the service-rejection path is tagged with the method (the schema-rejection path uses `pathParameters.method` which is always available at that point).
