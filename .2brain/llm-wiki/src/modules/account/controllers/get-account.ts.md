---
source: src/modules/account/controllers/get-account.ts
sha256: f0727e3acd71102ce9a2dc1603ee1765b59e533a9ed38bc934ae9e98d3291769
generated_at: 2026-09-23T17:59:49.991264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account.ts

## Purpose

Express controller for `GET /account`. Returns the authenticated user's full profile by reading fresh from the users collection, rather than echoing the (intentionally minimal) JWT claims, so fields like `verifiedAt` and `locale` are always present for the client's verify banner and saved-language flows.

## Key elements

- **`getAccount(request, response)`** — The sole export. Validates `request.authContext`, calls `accountService.getOwnProfile(id, callerContextOf(request))`, then maps the result through `userService.toUser(user, authContext.roles.tenant)` and sends a `successResponse<User>`. Returns 401 when the auth context is missing or when the user row no longer exists (dead session). Errors are delegated to `catchAs(response, 'getAccount')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService.getOwnProfile`, the primary data-fetch call.
- **`src/modules/users/service.ts` / `src/modules/users/index.ts`** — `userService.toUser` reshapes the raw account document into the public `User` DTO, injecting tenant roles from the pre-resolved auth context.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts per-request caller metadata passed into the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` standardize the JSON envelope.
- **`src/infrastructure/http/controller.ts`** — `catchAs` centralises async-error logging and HTTP error shaping.
- **`src/modules/account/routes.ts`** — Registers `getAccount` on the `GET /account` route.
- **`src/types/index.ts`** — Supplies the `User` type used as the generic on `successResponse<User>`.

## Notes

- The controller deliberately does **not** trust the JWT payload for profile fields. The token carries only `id / email / username / admin`; echoing it would silently omit `verifiedAt` and `locale`.
- Role information is read from `authContext.roles.tenant` (populated at token-verification time) rather than performing a second membership lookup.
- A `null`/`undefined` return from `getOwnProfile` is treated as a 401 (dead session), not a 404 or 500 — the intent is to signal "your token is no longer valid" to the client.
