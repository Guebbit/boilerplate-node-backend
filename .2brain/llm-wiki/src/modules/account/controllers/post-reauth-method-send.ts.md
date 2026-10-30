---
source: src/modules/account/controllers/post-reauth-method-send.ts
sha256: 381149cf73f2aa7e2f7cd6b6a780241471ae655f74ab0f1e572aa411d1e86086
generated_at: 2026-10-29T02:31:41.553679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reauth-method-send.ts

## Purpose

Thin HTTP adapter for `POST /account/reauth/methods/{method}/send`. It validates the path parameter, delegates to `accountService.sendReauthCode`, and shapes the JSON response. It exists so that an account **without** a password can receive a step-up code (e.g. via e-mail) using only a stale session.

## Key elements

- **`postReauthMethodSend`** (default export) – Express handler. Reads `id` from `request.authContext`, validates `{ method }` against the `SendReauthCodeParams` zod schema, calls `accountService.sendReauthCode(id, method, callerContext)`, and responds with a `200` + `TwoFactorDelivery` payload or a refusal.

## Relationships

- **`src/modules/account/routes.ts`** – Registers this handler as the POST route for `/account/reauth/methods/:method/send`.
- **`src/modules/account/services/index.ts`** – Provides `accountService.sendReauthCode`, the actual business logic invoked here.
- **`src/infrastructure/http/controller.ts`** – Supplies the shared helpers `parseBody`, `refused`, and `catchAs` used for input validation, refusal formatting, and error catching.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf` to extract authenticated caller metadata for the service call.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the standard 200 JSON envelope.
- **`src/types/index.ts`** – Provides the `TwoFactorDelivery` type that annotates the success payload.

## Notes

- **No fresh-auth guard on this endpoint.** By design, the reauth code *is* the mechanism that upgrades a stale session to a fresh one, so guarding it with freshness would be circular. The endpoint is rate-limited instead via a per-account delivery budget and a per-code cooldown (enforced inside the service, not here).
- The controller intentionally carries no business logic; all policy (which delivery channels are allowed, cooldowns, budget) lives in `accountService.sendReauthCode`.
