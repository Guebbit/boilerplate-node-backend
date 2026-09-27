---
source: src/modules/account/controllers/post-2fa-setup.ts
sha256: 124f03b401c46227b062f919529781bb3f29eb98392574da5c1672968b07b9a3
generated_at: 2026-09-27T14:24:07.907039+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/setup`. Validates the URL parameter, delegates to `twoFactorService.setupTwoFactorMethod`, and formats the service result into a standard HTTP response. Exists to keep route wiring (in `routes.ts`) decoupled from business logic.

## Key elements

- **`post2faSetup(request, response)`** — the sole export. Reads `request.authContext!.id`, safe-parses `request.params` against `SetupTwoFactorMethodParams` (Zod), calls `twoFactorService.setupTwoFactorMethod`, then responds with `successResponse<TwoFactorSetup>` or `rejectResponse`. Failures are funneled through `catchAs(response, 'post2faSetup')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | Imports `successResponse` and `rejectResponse` to build the JSON reply. |
| `src/infrastructure/http/controller.ts` | Imports `rejectValidation` (early-exit on bad params) and `catchAs` (unified error handler in the `.catch` branch). |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to extract IP/user-agent context passed to the service. |
| `src/modules/account/services/index.ts` | Imports and calls `twoFactorService.setupTwoFactorMethod` — the actual enrollment/restart logic. |
| `src/types/index.ts` | Imports `TwoFactorSetup` as the generic type for the success payload. |
| `src/modules/account/routes.ts` | Registers this handler on the `/account/2fa/methods/:method/setup` path (the controller does not import the routes file; the coupling is one-directional). |

## Notes

- **Security guard assumption:** `request.authContext!` is non-null because the route (see `routes.ts`) enforces fresh critical-auth middleware upstream. Removing that guard silently breaks this handler.
- **Param vs. body:** The `method` value is read from `request.params` (URL segment), not the request body. The Zod schema `SetupTwoFactorMethodParams` validates the *params* object.
- **Restart semantics:** Per the doc comment, calling this on an already-enrolled method *disarms* the existing factor. That is intentional and is why the route requires elevated authentication.
- **`catchAs` label:** The string `'post2faSetup'` is used as an error-log identifier; keep it in sync if you rename the export.
