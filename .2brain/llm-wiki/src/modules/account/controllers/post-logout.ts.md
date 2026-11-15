---
source: src/modules/account/controllers/post-logout.ts
sha256: c0582bfe9a4b2b3859edcd3edb6f6ba05c3e3ee358102fd706d77839cb1028a3
generated_at: 2026-11-14T18:33:40.437084+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter for `POST /account/logout`. Extracts the session credential from the incoming request, delegates revocation to `accountService.logoutCurrentSession`, clears the session cookie, and returns a bare 204. Exists to keep the routing layer free of business logic while providing a single, explicit entry point for ending *only the current* session.

## Key elements

- **`postLogout`** (exported) — Express handler `(request, response) => void`. Resolves the credential via `sessionCredentialOf`, calls `accountService.logoutCurrentSession(credential, callerContextOf(request))`, then destroys the session cookie and sends a 204. Errors are funnelled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — imports `catchAs`, the shared error-capture helper that maps rejections to an HTTP error response.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to derive caller context from the request, which is passed as the second argument to the service call.
- **`src/infrastructure/http/response.ts`** — imports `noContentResponse`, the canonical 204 writer.
- **`src/modules/account/routes.ts`** — registers `postLogout` as the handler for the `POST /account/logout` route.
- **`src/modules/account/services/index.ts`** — imports `accountService`; calls its `logoutCurrentSession` method, which performs the actual token revocation.
- **`src/modules/account/session/cookies.ts`** — imports `destroySessionCookie` to clear the refresh-cookie on the response.
- **`src/modules/account/session/session.ts`** — imports `sessionCredentialOf` to pull the refresh-token credential off the request.

## Notes

- **Always 204.** A missing, expired, or already-revoked cookie is treated as "not logged in here" and still yields a success response; the handler never returns 4xx/5xx for that case.
- **Current session only.** The refresh cookie acts as both the credential *and* the target address (same convention as `POST /account/refresh`), so no bearer token is required and other devices/sessions are unaffected.
- **No request body is read.** The only input that matters is the cookie set by `sessionCredentialOf`.
