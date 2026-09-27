---
source: src/modules/account/controllers/post-password-check.ts
sha256: b34514032adec073ff528b56e38db5cc4988c3cbbe20208051b9200d530c1cd1
generated_at: 2026-09-27T14:25:28.143790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-check.ts

## Purpose
Handler for `POST /account/password/check`. An advisory, unauthenticated endpoint that reports whether a candidate password appears in a breach database. It is designed for the signup flow (before an account exists) and **never blocks** anything — the four password-SET endpoints remain the authoritative server-side gate.

## Key elements
- **`postPasswordCheck`** (exported) — Express handler that validates the request body against the `CheckPasswordBreachedBody` Zod schema, delegates to `checkPasswordBreach`, and returns a `PasswordCheck`-typed result via `successResponse`.
- **Validation** — Uses `CheckPasswordBreachedBody.safeParse`; on failure short-circuits with `rejectValidation`.
- **Error handling** — Promise-rejection path is caught by `catchAs(response, 'postPasswordCheck')`.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` (Zod error → HTTP 422) and `catchAs` (unhandled rejection → structured 500).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 200 envelope wrapper.
- **`src/infrastructure/security/breached-passwords/index.ts`** — Source of `checkPasswordBreach`, the actual breach-lookup logic.
- **`src/modules/account/routes.ts`** — Wires `postPasswordCheck` onto the `POST /account/password/check` route.
- **`src/types/index.ts`** — Supplies the `PasswordCheck` return type used as the generic on `successResponse`.

## Notes
- Explicitly unauthenticated by design; do **not** add an auth guard without re-evaluating the signup use case.
- The controller uses a `.then().catch()` promise chain rather than `async/await`, consistent with the rest of the controller layer.
- The breach result is purely informational. Clients that ignore it can still attempt to set a breached password — the SET endpoints re-check independently.
