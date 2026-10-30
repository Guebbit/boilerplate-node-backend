---
source: src/modules/account/controllers/get-account.ts
sha256: a1eb675f7b91eda3eed6528372499c5fe638367d656cae44aa416e76fff7dd03
generated_at: 2026-10-29T02:26:39.612938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account.ts

## Purpose

HTTP controller for `GET /account`. It is a thin adapter that resolves the authenticated caller's full profile row from the users collection (via `accountService.getOwnProfile`), shapes it into the `Account` wire type, and returns it with an ETag. It exists separately from the service layer so that the HTTP concerns (auth check, status codes, ETag, response envelope) stay isolated from the data-access logic.

## Key elements

- **`getAccount(request, response)`** — the sole export. Resolves the caller's profile, sets a 401 on missing auth context or a deleted user row, sets an ETag on the response, and sends the shaped account via `successResponse<Account>`.
- **Auth guard** — reads `request.authContext`; rejects with 401 if absent. On a valid token whose user row no longer exists, also rejects with 401 (treated as a dead session, not a 500).
- **ETag** — `setEtag(response, user)` stamps the profile version that a subsequent profile edit will send back as `If-Match`.
- **Error handling** — the promise chain is terminated by `.catch(catchAs(response, 'getAccount'))`, delegating to the shared controller error handler.

## Relationships

- **`@infrastructure/http/response`** — uses `successResponse` / `rejectResponse` to emit the JSON envelope and status codes.
- **`@infrastructure/http/request`** — calls `callerContextOf(request)` to forward request-scoped metadata (e.g. IP) into the service call.
- **`@infrastructure/http/controller`** — calls `catchAs` to normalise unexpected rejections into a structured error response.
- **`@infrastructure/http/preconditions`** — calls `setEtag` to attach the profile version header.
- **`../services` (`src/modules/account/services/index.ts`)** — calls `accountService.getOwnProfile(id, callerCtx)` to fetch the fresh row.
- **`@modules/users` (`src/modules/users/index.ts`)** — calls `userService.toAccount(user, role)` to project the internal user shape into the public `Account` type.
- **`@types` (`src/types/index.ts`)** — references the `Account` type as the response payload generic.
- **`src/modules/account/routes.ts`** — registers `getAccount` as the handler for the `GET /account` route (implied by module layout).

## Notes

- The controller deliberately reads the user row rather than echoing JWT claims. The token only carries `id`, `email`, `username`, `admin`; fields like `verifiedAt` and `locale` (needed by the client's verification banner and saved-language flow) would be silently dropped if the token payload were returned.
- The role (`authContext.roles.tenant`) is read from the already-resolved auth context — it was populated once at token-verification time against the membership store, so no additional DB lookup occurs here.
- A 401 is returned (not 404 or 500) when the token is valid but the user row is missing; this signals to the client that the session is dead and credentials should be refreshed.
