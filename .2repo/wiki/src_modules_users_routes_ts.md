# src/modules/users/routes.ts

## Purpose

Defines all HTTP endpoints for user management (list, search, create, update, delete) on an Express `Router`. Every route is gated behind authentication and the admin role. This file is the sole wiring point between the HTTP layer and the user-module controllers.

## Key elements

- **`router`** (exported) – The Express `Router` instance; the only public export of this file.
- **Global middleware** – `getAuth`, `isAuth`, `isAdmin` applied via `router.use`, so no individual route needs to repeat them.
- **Read routes** (`GET /`, `POST /search`, `GET /:id`) – Delegate to `getUsers` or `getUserItem`; wrapped with `setCache(3600, …)` using the `users` cache tag.
- **Write routes** (`POST /`, `PUT /`, `PUT /:id`) – Delegate to `writeUsers`; wrapped with `invalidateCache(['users','account'])` and `upload.single('imageUpload')` for optional avatar uploads.
- **Delete routes** (`DELETE /`, `DELETE /:id`, `DELETE /:id/hard`) – Delegate to `deleteUsers`; wrapped with `invalidateCache(['users','account'])`. The `/:id/hard` variant additionally applies `routeFlag('hardDelete')` so the controller can distinguish a hard delete without a query-string check.

## Relationships

| Neighbor | Interaction |
|---|---|
| `controllers/get-users.ts` | Provides `getUsers` handler and `searchUsersKeyParameters` for cache-key building. |
| `controllers/write-users.ts` | Provides `writeUsers` handler used by all create/update routes. |
| `controllers/delete-users.ts` | Provides `deleteUsers` handler used by all delete routes. |
| `controllers/get-user-item.ts` | Provides `getUserItem` handler for `GET /:id`. |
| `@kernel/middlewares/authorizations` | `getAuth`, `isAuth`, `isAdmin` — applied to every route. |
| `@infrastructure/http/middlewares/cache` | `setCache` (read routes) and `invalidateCache` (write/delete routes). |
| `@infrastructure/http/middlewares/route-flag` | `routeFlag('hardDelete')` on the `/:id/hard` alias. |
| `@infrastructure/adapters/storage` | `upload` (multer-based) for single image-file uploads on write routes. |
| `module.ts` | Graph neighbor; expected to mount this `router` under a `/users` prefix (the file itself does not import it). |

## Notes

- **Route ordering matters:** `POST /search` is registered before `GET /:id` so that the literal segment `search` is never captured as an `:id` parameter.
- **Shared cache key:** Both `GET /` and `POST /search` write to the same cache key (`users:search`) with the same tag set, so a search response and a list response are cache-interchangeable.
- **`PUT /` vs `PUT /:id`:** Both call the same `writeUsers` handler; the distinction is only the HTTP surface (id-in-body vs. id-in-path). The handler must handle both shapes.
- **Hard-delete alias:** `DELETE /:id/hard` is functionally identical to `DELETE /:id?hardDelete=true`. `routeFlag('hardDelete')` injects the flag into the request so `deleteUsers` can branch on it without parsing the query string.
