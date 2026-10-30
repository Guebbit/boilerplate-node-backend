---
source: src/modules/account/controllers/post-password-check.ts
sha256: 36e28a3e612a6872df31c843885228138ffc99f7b64b35d595bd239794adb0b9
generated_at: 2026-10-29T02:31:25.539364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-check.ts

## Purpose

Advisory controller for `POST /account/password/check`. It reports whether a candidate password appears in known breach databases so the client can warn the user. It is deliberately unauthenticated (signup requires it before an account exists) and never blocks anything — the four password-SET endpoints remain the authoritative server-side gate.

## Key elements

- **`postPasswordCheck`** (exported) — Express handler. Validates the body against `CheckPasswordBreachedBody`, calls `checkPasswordBreach`, and returns the result as a `PasswordCheck`-typed success response. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides the `parseBody` and `catchAs` helpers used for input validation and uniform error handling.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, which shapes the HTTP reply.
- **`src/infrastructure/security/breached-passwords/index.ts`** — source of `checkPasswordBreach`, the actual lookup logic this controller delegates to.
- **`src/modules/account/routes.ts`** — registers `postPasswordCheck` as the handler for the `POST /account/password/check` route.
- **`src/types/index.ts`** — exports the `PasswordCheck` interface used as the response payload type.

## Notes

- This endpoint is **advisory only**. A "breached" verdict here does not prevent signup; the password-SET paths re-validate independently and are the real enforcement point.
- No authentication or authorization middleware is applied here by design.
- The module doc comment explicitly states that the four password-SET paths re-check server-side regardless of what this endpoint answers — do not treat this check as a security boundary.
