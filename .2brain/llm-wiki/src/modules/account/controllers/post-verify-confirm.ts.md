---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: 1f1a8ad3fb4491cc23ad139563b4b08e00f15c76a677e463d7a794ba419d0a12
generated_at: 2026-11-08T04:08:03.999426+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Controller handler for `POST /account/email-verification/confirm`. It validates a one-time verification token from the request body, delegates the find-then-spend operation to `accountService.confirmEmailVerification`, and responds with `204 No Content` on success. It exists to keep the HTTP-layer concerns (parsing, metric tracking, error shaping) separate from the domain logic in the account service.

## Key elements

- **`postVerifyConfirm(request, response)`** — the sole export. Accepts an Express `Request`/`Response`, validates the body against the `ConfirmEmailVerificationBody` Zod schema, calls the service, and writes the response.
- **`parseBody(ConfirmEmailVerificationBody, …)`** — runtime body validation; short-circuits with a 4xx if the token is missing or malformed.
- **`accountService.confirmEmailVerification(token, callerContext)`** — the domain call that looks up and spends the token. The controller never touches persistence directly.
- **`authEmailVerifyTotal.inc({ status })`** — Prometheus counter incremented on all three exit paths (`failure` for parse errors, service refusal, and exceptions; `success` for a clean 204).
- **`noContentResponse(response)`** — writes the 204 with no body on success.
- **`catchAs(response, 'postVerifyConfirm')(error)`** — normalises an unexpected throw into a structured error response.
- **`callerContextOf(request)`** — extracts the caller identity (IP, user-agent, etc.) passed into the service for audit logging.

## Relationships

- **`src/modules/account/routes.ts`** — registers `postVerifyConfirm` as the handler for the `/account/email-verification/confirm` route.
- **`src/modules/account/services/index.ts`** — provides `accountService.confirmEmailVerification`, which owns the token lookup and spend.
- **`src/modules/account/metrics.ts`** — exports `authEmailVerifyTotal`, the counter this handler increments.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody`, `refused`, and `catchAs` helpers.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`.
- **`src/infrastructure/http/response.ts`** — supplies `noContentResponse`.
- **`src/types/index.ts`** — defines the `VerifyEmailConfirmRequest` body type used for Express generics.

## Notes

- The endpoint is **deliberately public** (no auth middleware); the one-time token in the body *is* the credential, mirroring the pattern used by `password/reset/confirm` and `restore`.
- The controller is strictly a thin orchestration layer: no database calls, no token generation, no email sending. The service handles find-then-spend atomically.
- The metric is incremented **before** the response is written in every branch, so a client-side disconnect after the `inc()` still counts toward the counter.
