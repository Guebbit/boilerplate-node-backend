---
source: src/modules/account/controllers/get-account.ts
sha256: 594da0927d87cf30986ae0f8ea7c96dc4bdebdcc7daabb721011c82a234d37b1
generated_at: 2026-10-14T08:30:32.592222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-account.ts

## Purpose

Thin HTTP adapter that serves `GET /account`: returns the authenticated user's **full** profile read fresh from the users collection, rather than echoing the (narrower) JWT claims. This exists because the JWT only carries `id`, `email`, `username`, and `admin`, which would silently drop fields the client depends on (`verifiedAt`, `locale`).

## Key elements

- **`getAccount(request, response): void`** — the sole export. The Express controller for `GET /account`.
  1. Short-circuits with `401` if `request.authContext` is absent.
  2. Calls `accountService.getOwnProfile(authContext.id, callerContextOf(request))`.
  3. If the returned user is `null` (row deleted), responds `401` (dead session, not a server error).
  4. Sets an ETag on the raw user (`setEtag`) so the client can echo it as `If-Match` on subsequent profile edits.
  5. Maps the internal user to the API shape via `userService.toUser(user, authContext.roles.tenant)` and sends `200` with `successResponse<User>`.
  6. Catches any thrown error through `catchAs(response, 'getAccount')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | Uses `successResponse` and `rejectResponse` for all responses. |
| `src/infrastructure/http/request.ts` | Calls `callerContextOf(request)` to extract tenant/audit context for the service call. |
| `src/infrastructure/http/controller.ts` | Wraps the error path with `catchAs(response, 'getAccount')`. |
| `src/infrastructure/http/preconditions.ts` | Calls `setEtag(response, user)` to set the `ETag` header. |
| `src/modules/account/services/index.ts` | Imports `accountService`; calls its `getOwnProfile` method. |
| `src/modules/users/index.ts` | Imports `userService`; calls `toUser` to shape the response payload. |
| `src/modules/users/services/index.ts` | Indirect dependency — `userService` is re-exported through the `@modules/users` barrel. |
| `src/types/index.ts` | Imports the `User` type used as the generic on `successResponse<User>`. |
| `src/modules/account/routes.ts` | Consumes `getAccount` as the handler registered for the `GET /account` route. |

## Notes

- **401 vs. 404:** A valid token whose database row has been deleted returns `401`, not `404`. The code comment frames this as a "dead session, not a server fault." Avoid changing this to `404` without confirming client expectations.
- **ETag is set on the raw user, before `toUser` mapping.** The version string is derived from the internal representation; the response body uses the mapped shape.
- **`authContext.roles.tenant`** is passed to `toUser`, meaning the role/tenant information resolved at token-verification time is reused here — no second membership lookup is made.
- **`callerContextOf(request)`** is forwarded to the service; it likely carries request-level metadata (IP, tenant, etc.) for auditing inside `getOwnProfile`.
