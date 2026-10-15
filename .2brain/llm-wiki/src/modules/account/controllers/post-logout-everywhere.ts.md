---
source: src/modules/account/controllers/post-logout-everywhere.ts
sha256: 4d7cf336a707426870ac95cb145e646491410b9bfdc2853072317ad500517de2
generated_at: 2026-10-15T09:55:33.005389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Thin HTTP adapter for `POST /account/logout-all`. It delegates to `accountService.logoutEverywhere`, then destroys the caller's session cookie and returns a translated success or rejection response. Exists so the route layer stays declarative and all HTTP I/O lives in one small handler.

## Key elements

- **`postLogoutEverywhere(request, response)`** – The sole export. Calls `accountService.logoutEverywhere` with the authenticated user's ID and the caller context, then either:
  - Rejects with `result.status` and `result.errors` when `result.success` is falsy, **or**
  - Calls `destroySessionCookie(response)` and returns `successResponse` with the i18n key `account.logout.all-success`.
  - All unhandled promise rejections are funneled through `catchAs(response, 'postLogoutEverywhere')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Imports `accountService`; calls `.logoutEverywhere(userId, callerContext)`. |
| `src/modules/account/session/cookies.ts` | Imports `destroySessionCookie`; invoked on the success path to clear the refresh cookie. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to extract the caller's IP/UA context from the Express request. |
| `src/infrastructure/http/response.ts` | Imports `rejectResponse` and `successResponse` for the two terminal paths. |
| `src/infrastructure/http/controller.ts` | Imports `catchAs` to convert an unhandled rejection into a structured HTTP error. |
| `src/infrastructure/i18n/index.ts` | Imports `t` to resolve the user-facing success message. |
| `src/modules/account/routes.ts` | Consumes this controller and binds it to `POST /account/logout-all`. |

## Notes

- **Security invariant:** if `result.success` is false the handler returns a rejection *before* touching the cookie. The inline comment makes explicit that letting a failed revocation read as success would leave a stolen device still authenticated.
- **Caller is also signed out.** There is intentionally no "re-mint" path; the session cookie is destroyed and the session epoch is advanced (inside the service) so previously issued access tokens are invalidated too.
- `request.authContext!.id` uses a non-null assertion — the route is expected to be behind an auth middleware that populates `authContext`; the controller does not guard against it being absent.
