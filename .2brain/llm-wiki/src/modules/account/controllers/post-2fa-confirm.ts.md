---
source: src/modules/account/controllers/post-2fa-confirm.ts
sha256: bd34495f7810afb2959bce9bf775d389c0e640e85809ff53878f74ca7707e7d7
generated_at: 2026-10-29T02:28:18.808231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/confirm`. Validates the incoming request, delegates to `twoFactorService.confirmTwoFactorMethod`, handles session reminting (since arming a factor revokes all existing sessions), and returns the confirmation payload including backup codes when this is the account's first factor.

## Key elements

- **`post2faConfirm`** (exported) — Express handler for the confirm endpoint. Parses path params (`method`) and body (`code`) via Zod schemas, calls the service, remints the session, and responds.
- **Session snapshot → confirm → remint** — `sessionSnapshotOf` is captured *before* calling `confirmTwoFactorMethod`, because that call revokes all sessions (including the caller's). `remintSession` then issues a fresh session carrying the original AMR claims plus `AMR.otp`.
- **`authTwoFactorEnrollTotal`** — Prometheus counter incremented with `status: 'success'` or `'failure'` on every terminal path (body-parse rejection, service refusal, or success).
- **`withProofs(amr, AMR.otp)`** — appends the OTP assertion-method reference to the session proof set before reminting.
- **`catchAs(response, 'post2faConfirm')`** — terminal error handler; maps unexpected throws to a structured error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `parseBody`, `refused`, and `catchAs` used for request validation, service-result unwrapping, and error termination.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts IP/UA context forwarded to the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the 200 JSON reply.
- **`src/modules/account/services/index.ts`** — `twoFactorService.confirmTwoFactorMethod` is the business-logic call this controller wraps.
- **`src/modules/account/session/session.ts`** — `sessionSnapshotOf` and `remintSession` handle the revoke-and-reissue session dance.
- **`src/modules/account/domain/session-proof.ts`** — `AMR.otp` constant and `withProofs` helper used to stamp the new session's proof set.
- **`src/modules/account/metrics.ts`** — exports the `authTwoFactorEnrollTotal` counter.
- **`src/modules/account/routes.ts`** — wires this handler to the `POST /account/2fa/methods/:method/confirm` route.
- **`src/types/index.ts`** — defines the `TwoFactorConfirmRequest` and `TwoFactorConfirmed` shapes used in the typed `Request`/`Response` generics.

## Notes

- The session snapshot must be taken **before** `confirmTwoFactorMethod` is called; the comment in the code explicitly calls this out because the service deletes all sessions as part of arming. Reordering those two calls will 401 the caller.
- `request.authContext!` relies on upstream auth middleware having populated the context; this controller does not guard against its absence.
- The `method` label on the metric comes from the validated path parameter (not the body), so it is safe even when body parsing fails.
- On the success path the response body merges `result.data` (service output, e.g. backup codes) with `issued` (the freshly reminted session token) into a single `TwoFactorConfirmed` object.
