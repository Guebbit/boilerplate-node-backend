---
source: src/modules/account/controllers/post-reauth.ts
sha256: 34d8b62f21931310f4575230a2d0728662477a24c8354c6ec3742a6b78abc891
generated_at: 2026-11-08T04:07:01.704911+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth.ts

## Purpose

Thin HTTP adapter for `POST /account/reauth`. It answers a `401 REAUTH_REQUIRED` step-up challenge by re-proving the caller (password or emailed code), then re-mints the existing session with a fresh `auth_time` without destroying it. The `amr` claim on the new session reflects only what this specific call proved.

## Key elements

- **`postReauth(request, response)`** — the sole export. Validates the body against `ReauthBody`, delegates credential verification to `accountService.reauth`, then calls `reissueSession` to mint a new token pair. Returns 200 with `AuthTokens` on success; any failure (parse, service refusal, or re-mint error) yields a non-2xx and increments the `failure` metric.

## Relationships

- **`src/modules/account/routes.ts`** — registers `POST /account/reauth` → `postReauth` (typically behind `isAuth` middleware, which populates `request.authContext`).
- **`src/modules/account/services/index.ts`** — calls `accountService.reauth(id, parsed, callerContext)`; this service performs the credential comparison but writes nothing and revokes nothing.
- **`src/modules/account/session/session.ts`** — calls `reissueSession(request, response, id, { amr })` to produce the fresh token pair; same code path `postLogin` and `postPasswordChange` use at their tail.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (zod validation short-circuit) and `refused` (uniform rejection check on service results).
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError(response, 'postReauth', error)` formats the 500 in the `.catch` branch.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the IP/UA context passed to the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` writes the 200 JSON body.
- **`src/modules/account/metrics.ts`** — `authReauthTotal` counter incremented with `status: 'success' | 'failure'` on every terminal path.
- **`src/types/index.ts`** — `ReauthRequest` (typed `request.body`) and `AuthTokens` (response payload).

## Notes

- A **failed re-mint is fatal to the 200 path**. The comment in the code explains why: `accountService.reauth` only *compares* the credential—it does not write or revoke. If `reissueSession` then throws, the whole endpoint's purpose (clearing the step-up challenge) has not been achieved, so the error must fall through to `.catch` → 500. A 200 with no token would falsely signal that the challenge was cleared.
- The `amr` array on the reissued session is **not cumulative**. Only the proof supplied in this call is recorded (e.g. `["otp"]` if a code was used); nothing is carried over from the original login.
- `request.authContext` is asserted non-null (`!`) on the assumption that the `isAuth` middleware runs first; there is no defensive guard in this controller.
