---
source: src/modules/account/controllers/post-reauth-method-send.ts
sha256: 28b4130dc5a66ca82003673ef3294b0cc9e8186916c74e886ee3e2cf243ec5c4
generated_at: 2026-10-14T08:36:16.582351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth-method-send.ts

## Purpose

Thin HTTP adapter for `POST /account/reauth/methods/{method}/send`. It validates the path parameter, delegates to `accountService.sendReauthCode` to mail a step-up code to a passwordless account, and shapes the HTTP response. It exists so the service layer stays transport-agnostic.

## Key elements

- **`postReauthMethodSend`** (exported function) — The sole controller handler. Accepts Express `Request<{ method: string }>` / `Response`. Steps:
  1. Reads the authenticated user's `id` from `request.authContext`.
  2. Validates `request.params` against the Zod schema `SendReauthCodeParams`; short-circuits with `rejectValidation` on failure.
  3. Calls `accountService.sendReauthCode(id, method, callerContextOf(request))`.
  4. On success: responds `200` with a `TwoFactorDelivery` body and an i18n message (`account.two-factor.code-sent`).
  5. On rejection/error: delegates to `refused` / `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Provides `rejectValidation`, `refused`, `catchAs` helpers that standardize error/rejection responses.
- **`@infrastructure/http/request`** — Provides `callerContextOf(request)`, extracting IP/user-agent context passed into the service call.
- **`@infrastructure/http/response`** — Provides `successResponse` for the 200 reply.
- **`@infrastructure/i18n`** — Provides the `t()` translation function for the user-facing message.
- **`@types`** — Supplies the `TwoFactorDelivery` type used in the response payload.
- **`../services`** (`src/modules/account/services/index.ts`) — Source of `accountService`, which owns the actual reauth-code logic.
- **`src/modules/account/routes.ts`** — Registers this handler at the `POST /account/reauth/methods/:method/send` route.

## Notes

- **No fresh-auth guard.** This endpoint is intentionally reachable by a stale session (that's the point—it's how a passwordless account proves itself). Rate-limiting is handled upstream via per-account delivery budget and per-code cooldown, not here.
- `request.authContext!` uses a non-null assertion; the auth middleware is expected to have already populated it before this handler runs.
- The `method` path segment is a string at the Express layer and is narrowed to a valid `TwoFactorDelivery` value only after the Zod parse succeeds.
