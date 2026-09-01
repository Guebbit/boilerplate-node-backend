# src/modules/users/routes.ts

## Purpose

Defines the admin-only Express router for the `/users` resource. It composes authorization, response-caching, file-upload, and route-flag middlewares with the user controllers to expose search, read, create, update, and delete (soft + hard) operations.

## Key elements

- **`router`** – The exported Express `Router`. All routes inherit `getAuth → isAuth → isAdmin` via `router.use`.
- **`cacheUsersSearch`** – A `searchCache('users', searchUsersKeyParameters)` middleware; reads cached search results keyed on the same query params the `getUsers` schema accepts.
- **Read routes** – `GET /` and `POST /search` use `cacheUsersSearch`; `GET /:id` additionally writes into cache via `setCache(3600, { tags: ['users'] })`.
- **Write routes** – `POST /`, `PUT /`, `PUT /:id` chain `invalidateCache(['users','account'])` → `upload.single('imageUpload')` → `writeUsers`.
- **Delete routes** – `DELETE /`, `DELETE /:id` perform a soft delete; `DELETE /:id/hard` applies `routeFlag('hardDelete')` before calling the same `deleteUsers` handler.
- **Route-order comment** – `POST /search` is deliberately registered before any `/:id` pattern so "search" isn't captured as an id.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/middlewares/authorizations.ts` | Supplies `getAuth`, `isAuth`, `isAdmin` applied globally to every route. |
| `src/infrastructure/adapters/storage.ts` | Supplies `upload` (single-file multer) on all write routes. |
| `src/infrastructure/http/middlewares/cache.ts` | Supplies `searchCache`, `setCache`, `invalidateCache` for read/write cache management. |
| `src/infrastructure/http/middlewares/route-flag.ts` | Supplies `routeFlag('hardDelete')` to mark the path-segment hard-delete variant. |
| `src/modules/users/controllers/get-users.ts` | Exports `getUsers` handler and `searchUsersKeyParameters` (cache key config). |
| `src/modules/users/controllers/get-user-item.ts` | Exports `getUserItem` for `GET /:id`. |
| `src/modules/users/controllers/write-users.ts` | Exports `writeUsers` for create/update. |
| `src/modules/users/controllers/delete-users.ts` | Exports `deleteUsers` for soft and hard delete. |
| `src/modules/users/module.ts` | Mounts the exported `router` into the application. |
| `src/modules/users/tests/unit/routes.test.ts` | Unit-tests the route wiring. |
| `tests/cross-cutting/authenticated-controllers.test.ts` | Verifies auth middlewares are present on these routes. |
| `tests/cross-cutting/write-routes-are-guarded.test.ts` | Verifies write/delete routes carry the required guard chain. |

## Notes

- **Hard-delete is reachable two ways:** `DELETE /:id?hardDelete=true` (query-param) and `DELETE /:id/hard` (path-segment). Both invoke the same `deleteUsers` handler; the path variant uses `routeFlag` to set the flag in the request context.
- **Cache tags:** every mutating route invalidates both `'users'` **and** `'account'` tags, so account-level caches are kept consistent.
- **No wildcard catch-all** is defined; any unlisted path on this router falls through to 404 (or whatever the parent router handles).
