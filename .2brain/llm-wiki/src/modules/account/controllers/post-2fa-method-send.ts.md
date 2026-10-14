---
source: src/modules/account/controllers/post-2fa-method-send.ts
sha256: 31441880cc8d43e8168d162a7c61e428c2cccb18761a7c3a2ad70cb0cf779163
generated_at: 2026-10-14T08:33:15.534488+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-method-send.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/send`. It validates the `method` path parameter, delegates to `twoFactorService.sendMethodCode`, and maps the result to a standard HTTP success or error response. It exists to keep the service layer free of Express-specific concerns.

## Key elements

- **`post2faMethodSend`** (exported) — The sole controller handler. Accepts Express `Request`/`Response`, parses `request.params.method` with the `SendTwoFactorMethodCodeParams` Zod schema, calls `twoFactorService.sendMethodCode(id, method, callerContext)`, and responds with either a `200` success (body: `TwoFactorDelivery`, i18n message `account.two-factor.code-sent`) or a structured error via `refused`/`rejectValidation`/`catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `rejectValidation`, `refused`, and `catchAs` for uniform error-response handling.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to extract the caller's IP/user-agent context for the service call.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to build the 200 JSON envelope.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` to translate the `account.two-factor.code-sent` message.
- **`src/modules/account/services/index.ts`** — Imports `twoFactorService`, whose `sendMethodCode` method performs the actual code-generation and delivery.
- **`src/modules/account/routes.ts`** — Registers this handler at the `/account/2fa/methods/:method/send` route (with upstream auth and rate-limit guards).
- **`src/types/index.ts`** — Supplies the `TwoFactorDelivery` type used as the success-response payload shape.

## Notes

- `request.authContext!` uses a non-null assertion: the controller assumes the route middleware has already resolved and attached auth context. If a route is mounted without that middleware, this will throw at runtime rather than returning a clean 401.
- The doc comment explicitly states that "fresh critical auth and the per-account delivery budget" are **route-level guards**, not enforced inside this controller.
- The handler uses a `.then`/`.catch` promise chain rather than `async`/`await`, consistent with the project's controller convention.
