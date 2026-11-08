---
source: src/modules/account/controllers/post-2fa-setup.ts
sha256: 2ed6b8d250100ed52d6fc6df6fcbac9158695b77beca75c8d3eae667a957ab6e
generated_at: 2026-11-08T04:04:01.614981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/setup`. Validates the path parameter and optional body, then delegates to `twoFactorService.setupTwoFactorMethod` to start or restart enrollment of a single 2FA method. The restart path (re-enrolling an already-armed method) requires a valid code from an existing factor as a guard against session-hijack attacks.

## Key elements

- **`post2faSetup`** (exported) — Express handler `(request, response) => void`. Reads `request.authContext!.id`, validates `method` from route params and an optional `code` from the body, calls the service, and writes a success or rejection response.
- **`SetupTwoFactorMethodParams` / `SetupTwoFactorMethodBody`** — Zod schemas (from `@api/schemas.zod`) used via `parseBody` to validate route params and body before the service call.
- **`callerContextOf(request)`** — Extracts IP/user-agent context forwarded to the service for audit or rate-limiting.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (validation + early rejection) and `catchAs` (structured error serialization).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to capture request metadata.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` and `rejectResponse` helpers.
- **`src/modules/account/services/index.ts`** — Exports `twoFactorService`, whose `setupTwoFactorMethod(id, method, code, ctx)` performs the actual enrollment logic.
- **`src/modules/account/routes.ts`** — Registers `post2faSetup` on the `POST /account/2fa/methods/:method/setup` route (with the critical-auth route guard mentioned in the JSDoc).
- **`src/types/index.ts`** — Provides the `TwoFactorSetup` type used as the generic for the success response.

## Notes

- The body is intentionally optional: the *first* factor a user sets up sends no `code`. Once any factor is armed, a restart **must** supply a valid code — this is the primary defense against an attacker with a stolen session re-arming a factor.
- `request.authContext!` uses a non-null assertion; the route guard upstream is responsible for guaranteeing it is populated.
- The handler returns `void` on early validation failure (after `parseBody` has already sent a response) rather than throwing — a convention shared with other controllers in this module.
