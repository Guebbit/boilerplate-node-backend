---
source: src/modules/account/controllers/post-2fa-setup.ts
sha256: 2ed6b8d250100ed52d6fc6df6fcbac9158695b77beca75c8d3eae667a957ab6e
generated_at: 2026-10-29T02:29:02.651560+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-2fa-setup.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/methods/{method}/setup`. Validates the request, then delegates to `twoFactorService.setupTwoFactorMethod`. Exists to keep Express-specific concerns (parsing, response shaping, error catching) out of the service layer.

## Key elements

- **`post2faSetup(request, response)`** — exported handler. Extracts `id` from `request.authContext`, parses the URL `method` param and an optional `code` body, calls the two-factor service, and maps the result to a success or rejection response.
- **`parseBody(SetupTwoFactorMethodParams, …)`** — validates `request.params` against the Zod schema; short-circuits with a 422-style rejection on failure.
- **`parseBody(SetupTwoFactorMethodBody, request.body ?? {}, …)`** — validates the (optional) body; the `?? {}` default means the first factor enrollment sends no body.
- **`callerContextOf(request)`** — extracts caller metadata (IP, user-agent, etc.) and passes it to the service for audit logging.
- **`.catch(catchAs(response, 'post2faSetup'))`** — converts any thrown error into a uniform 500 response with a structured error envelope.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `parseBody` and `catchAs` helpers used for validation and error catching.
- **`src/infrastructure/http/request.ts`** — source of `callerContextOf` for audit-context extraction.
- **`src/infrastructure/http/response.ts`** — source of `successResponse` / `rejectResponse` for shaping the outgoing payload.
- **`src/modules/account/routes.ts`** — registers `post2faSetup` on the `POST /account/2fa/methods/:method/setup` route (and applies the critical-auth guard).
- **`src/modules/account/services/index.ts`** — exports `twoFactorService`, whose `setupTwoFactorMethod` method performs the actual enrollment logic.
- **`src/types/index.ts`** — provides the `TwoFactorSetup` type used as the generic on `successResponse`.

## Notes

- **Optional body is intentional.** The account's first 2FA factor has no pre-existing code to submit; the `?? {}` default and the optional-field Zod schema handle this without a separate code path.
- **Security contract (documented in the JSDoc).** The route guard enforces fresh critical auth. Once any factor is already armed, a `code` from an existing factor is required to start a new one—this is the "restart disarms" protection against a stolen-session attacker swapping factors.
- **`request.authContext!`** uses a non-null assertion; safety depends entirely on the upstream route guard, not on a runtime check here.
