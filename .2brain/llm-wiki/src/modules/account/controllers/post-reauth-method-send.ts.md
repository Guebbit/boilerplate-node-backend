---
source: src/modules/account/controllers/post-reauth-method-send.ts
sha256: 381149cf73f2aa7e2f7cd6b6a780241471ae655f74ab0f1e572aa411d1e86086
generated_at: 2026-11-08T04:06:49.922890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth-method-send.ts

## Purpose

Thin Express controller for `POST /account/reauth/methods/{method}/send`. It validates the path parameter, extracts the caller context, and delegates to `accountService.sendReauthCode`. Exists to give password-less accounts a way to obtain a step-up code, using per-account delivery budgets and per-code cooldowns as the rate-limiting mechanism (no fresh-auth guard is applied).

## Key elements

- **`postReauthMethodSend`** *(exported)* — The route handler. Reads `id` from `request.authContext`, validates `{ method }` via the `SendReauthCodeParams` Zod schema, calls `accountService.sendReauthCode`, then either rejects (via `refused`) or returns a `200` with a `TwoFactorDelivery` payload.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (Zod validation of path params), `refused` (uniform rejection short-circuit), and `catchAs` (unified error formatting).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to derive the caller identity/context passed to the service layer.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to shape the 200 JSON reply.
- **`src/modules/account/services/index.ts`** — Source of `accountService.sendReauthCode`, the business-logic call this controller wraps.
- **`src/modules/account/routes.ts`** — Registers `postReauthMethodSend` on the `/account/reauth/methods/:method/send` route.
- **`src/types/index.ts`** — Exports the `TwoFactorDelivery` type used as the response payload.

## Notes

- `request.authContext!` uses a non-null assertion; the file assumes upstream auth middleware has already populated it.
- The deliberate absence of a fresh-auth guard is a design choice (documented in the file's JSDoc), not an oversight. Do not add one without re-evaluating the stale-session recovery flow.
- The `method` value is a **path parameter** (not body), validated by `SendReauthCodeParams` from `@api/schemas.zod`.
