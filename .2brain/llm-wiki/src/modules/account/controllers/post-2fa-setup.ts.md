---
source: src/modules/account/controllers/post-2fa-setup.ts
sha256: 106234a2e4ba0ed97d5d5f204eba27c78a1bfdf06359a8e8bd33fe7d3884358e
generated_at: 2026-09-23T18:01:33.844999+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/setup`. It validates the `method` path parameter via a Zod schema, delegates to `twoFactorService.setupTwoFactorMethod`, and maps the service result onto a standard HTTP response. It exists to keep Express plumbing out of the service layer.

## Key elements

- **`post2faSetup`** (exported) — Express handler. Reads `request.authContext!.id`, safe-parses `request.params` with `SetupTwoFactorMethodParams`, calls the service, and branches into `successResponse` / `rejectResponse` / `rejectDatabaseError` based on the outcome.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `rejectValidation`, used to short-circuit on Zod parse failure.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError`, the catch-all for unexpected service/database errors.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which extracts per-request context (IP, UA, etc.) passed into the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse`, the standard response helpers.
- **`src/modules/account/services/index.ts`** — exports `twoFactorService`; this controller is its sole HTTP consumer for the setup method.
- **`src/modules/account/routes.ts`** — registers `post2faSetup` as the handler for the `POST /account/2fa/methods/:method/setup` route (with a critical-auth guard).
- **`src/types/index.ts`** — exports the `TwoFactorSetup` type used as the response payload generic.

## Notes

- **Security rationale (from the file doc):** the route requires _fresh_ critical authentication because restarting a method disarms a currently-working factor — the exact action an attacker with a stolen long-lived session would take. The controller itself does not enforce this; it relies on the route guard in `routes.ts`.
- **Non-null assertion on `request.authContext!`:** the handler assumes the auth middleware has already populated `authContext`. If the route guard is ever removed or bypassed, this will throw at runtime rather than returning 401.
- **Param validation is Zod-based, not Express-based:** `method` arrives as a string path param and is validated against `SetupTwoFactorMethodParams` before touching the service.
