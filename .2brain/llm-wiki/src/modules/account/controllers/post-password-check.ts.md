---
source: src/modules/account/controllers/post-password-check.ts
sha256: 36e28a3e612a6872df31c843885228138ffc99f7b64b35d595bd239794adb0b9
generated_at: 2026-11-08T04:06:41.371754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-password-check.ts

## Purpose

Handles the unauthenticated `POST /account/password/check` endpoint, which reports whether a candidate password appears in a known-breach database. It exists to give clients (e.g., a signup form) an advisory signal before an account is created. It is intentionally non-blocking: the four password-SET endpoints remain the authoritative server-side gate.

## Key elements

- **`postPasswordCheck`** (exported function) — Express handler that validates the request body against the `CheckPasswordBreachedBody` Zod schema, calls `checkPasswordBreach(password)`, and returns a `PasswordCheck` payload via `successResponse`. Errors are funneled through `catchAs`.
- **`CheckPasswordBreachedBody`** (imported Zod schema) — shapes the expected body; `parseBody` rejects the request early if validation fails.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation + early 400) and `catchAs` (structured error handler).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for uniform JSON success envelopes.
- **`src/infrastructure/security/breached-passwords/index.ts`** — supplies `checkPasswordBreach`, the async service that queries the breach data source.
- **`src/modules/account/routes.ts`** — registers `postPasswordCheck` as the handler for the `POST /account/password/check` route.
- **`src/types/index.ts`** — provides the `PasswordCheck` return type.

## Notes

- The endpoint is **advisory only**. A 200 with a "breached" flag does not prevent a subsequent password-SET request from succeeding or failing; those endpoints re-validate independently.
- No authentication middleware is applied here by design (the caller may not yet have an account).
- The handler is a thin orchestration layer: all logic (breach lookup, response shape) lives in the imported modules, so changes to breach-checking behavior won't require touching this file.
