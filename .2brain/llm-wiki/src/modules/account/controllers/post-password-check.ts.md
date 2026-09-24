---
source: src/modules/account/controllers/post-password-check.ts
sha256: e8f7db4c4ee1423507fb3d167c19a73053d624496a87f1e85afa35cbbfe2b775
generated_at: 2026-09-23T18:03:11.963817+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-check.ts

## Purpose

Controller for `POST /account/password/check`. It returns a candidate password's breach-status report as an **advisory** signal. It is unauthenticated by design (signup needs it before an account exists) and never blocks any operation — the four password-SET endpoints remain the authoritative server-side gate.

## Key elements

- **`postPasswordCheck`** *(exported handler)* — Validates the request body against the `CheckPasswordBreachedBody` Zod schema, delegates to `checkPasswordBreach`, and returns a `PasswordCheck` result or a structured error response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation`, used to short-circuit on Zod parse failure.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse<PasswordCheck>` for the happy path.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError`, invoked if `checkPasswordBreach` throws.
- **`src/infrastructure/security/breached-passwords/index.ts`** — Source of `checkPasswordBreach`, the actual breach-lookup function.
- **`src/modules/account/routes.ts`** — Registers `postPasswordCheck` as the handler for the `POST /account/password/check` route.
- **`src/types/index.ts`** — Exports the `PasswordCheck` result type used as the response payload.

## Notes

- This endpoint is intentionally **non-blocking**. A breach warning here carries no enforcement; the password-SET paths re-validate server-side regardless.
- The handler is fully synchronous in structure (single promise chain) — no middleware or session logic is involved.
- Validation is handled inline via `safeParse` rather than relying on route-level middleware, consistent with the `rejectValidation` pattern from the controller utility.
