---
source: src/modules/account/controllers/post-verify-confirm.ts
sha256: 1f1a8ad3fb4491cc23ad139563b4b08e00f15c76a677e463d7a794ba419d0a12
generated_at: 2026-10-29T02:32:51.001321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-verify-confirm.ts

## Purpose

Controller for `POST /account/email-verification/confirm`. Validates the request body, delegates to the account service to spend a one-time email-verification token and mark the email as verified, and emits a Prometheus metric for the outcome.

## Key elements

- **`postVerifyConfirm`** (exported handler) — Express handler accepting `Request<unknown, unknown, VerifyEmailConfirmRequest>` / `Response`. Parses the body against the `ConfirmEmailVerificationBody` Zod schema, calls `accountService.confirmEmailVerification(token, callerContext)`, and returns either `204 No Content` or an error response.
- **`parseBody` / `refused` / `catchAs`** — imported from the HTTP controller helper; handle schema validation, service-level refusal, and unexpected exception formatting respectively.
- **`authEmailVerifyTotal`** — Prometheus counter (from `../metrics`) incremented with `{ status: 'success' | 'failure' }` on every code path.
- **`callerContextOf`** — extracts caller metadata from the raw request and passes it into the service call.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `parseBody`, `refused`, `catchAs` helpers used for validation and error rendering.
- **`src/infrastructure/http/response.ts`** — source of `noContentResponse` (204 reply).
- **`src/infrastructure/http/request.ts`** — source of `callerContextOf` (caller identity extraction).
- **`src/modules/account/services/index.ts`** — provides `accountService.confirmEmailVerification`, which owns the find-then-spend token logic.
- **`src/modules/account/metrics.ts`** — provides the `authEmailVerifyTotal` counter.
- **`src/modules/account/routes.ts`** — registers this handler on the `/account/email-verification/confirm` route.
- **`src/types/index.ts`** — source of the `VerifyEmailConfirmRequest` body type used in the Express `Request` generic.

## Notes

- The endpoint is intentionally **public** (no auth middleware); the token in the body *is* the credential, mirroring the pattern used by `password/reset/confirm` and `restore`.
- The token is **one-time**: the service "finds then spends" it, so replay is impossible.
- Success returns **204 No Content** (no body). All other outcomes (bad schema, service refusal, thrown error) result in an error response.
- The metric is incremented in **every** exit path (validation failure, service refusal, success, uncaught error), so the counter total equals the number of attempts.
- `catchAs` is called with the literal string `'postVerifyConfirm'` as its context label for log correlation.
