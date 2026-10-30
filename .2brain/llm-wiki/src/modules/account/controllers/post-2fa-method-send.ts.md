---
source: src/modules/account/controllers/post-2fa-method-send.ts
sha256: 45a36c2e738fab244f8b18ffc4d48133eea5f1e427a43bbd10ca62db8444ffd4
generated_at: 2026-10-29T02:28:53.141717+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-method-send.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa-methods/{method}/send`. Parses the path parameter, delegates to `twoFactorService.sendMethodCode`, and maps the result (or refusal) to an Express response. It exists so the route layer stays declarative while business logic lives in the service.

## Key elements

- **`post2faMethodSend(request, response)`** — the sole export. Reads the caller's account id from `request.authContext`, validates `request.params` against `SendTwoFactorMethodCodeParams`, calls the service, and responds with `200` + `TwoFactorDelivery` on success or the standard refusal/error paths.

## Relationships

- **`src/modules/account/services/index.ts`** — source of `twoFactorService.sendMethodCode`, the actual business logic this controller wraps.
- **`src/modules/account/routes.ts`** — registers `post2faMethodSend` as the handler for the `POST /account/2fa-methods/:method/send` route (and enforces the auth / budget guards mentioned in the JSDoc).
- **`src/infrastructure/http/controller.ts`** — provides the shared helpers `parseBody`, `refused`, and `catchAs` used to keep the controller body minimal.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the IP/UA context passed into the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` formats the 200 payload.
- **`src/types/index.ts`** — defines the `TwoFactorDelivery` type used in the response generics.

## Notes

- Despite the name `parseBody`, it is applied to `request.params`, not `request.body` — it's a generic Zod-validation helper reused for path/query/body.
- The JSDoc explicitly states that "fresh critical auth and the per-account delivery budget are the route's own guards," so neither is checked here; if a caller reaches this function without those guards, the service itself is the last line of defense.
- The handler uses a promise `.then/.catch` chain rather than `async/await`; follow that style when editing.
