# src/modules/users/routes.ts

## Purpose

Defines the Express router for all `/users` admin endpoints (search, read, create, update, delete, and 2FA recovery). Every route is gated behind authentication and the admin role. This file is the single wiring point that composes authorization, caching, rate-limiting, file-upload, and flag middleware around the module's five controllers.

## Key elements

- **`router`** (exported) — the Express `Router` instance; all routes carry `getAuth → isAuth → isAdmin` via a blanket `router.use(...)`.
- **`cacheUsersSearch`** — a `searchCache('users', …)` reader keyed on the same query params `getUsers` accepts; attached to `POST /search` and `GET /`.
- **`POST /search`** — placed before `/:id` so "search" is never captured as an id.
- **`POST /` · `PUT /` · `PUT /:id`** (create / update) — each chains `uploadLimiter → invalidateCache → upload.single('imageUpload') → writeUsers`.
- **`DELETE /` · `DELETE /:id`** — `invalidateCache → deleteUsers`; soft-delete by default.
- **`DELETE /:id/hard`** — same as above but adds `routeFlag('hardDelete')`, which sets the flag in the request for `deleteUsers`.
- **`DELETE /:id/2fa`** — admin-assisted 2FA removal; intentionally bypasses the "prove-the-factor" rule (see controller comment).
- **`GET /:id`** — `setCache(3600, …) → getUserItem`.

## Relationships

- **`@kernel/middlewares/authorizations`** — provides `getAuth`, `isAuth`, `isAdmin`; applied globally to every route.
- **`@infrastructure/http/middlewares/cache`** — `searchCache` (read-through on list/search), `setCache` (write-through on `GET /:id`), `invalidateCache` (tag-based invalidation on every mutation).
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` guards the three upload-bearing write routes.
- **`@infrastructure/adapters/storage`** — `upload` (multer instance) handles the single `imageUpload` field on create/update.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` signals the hard-delete intent to `deleteUsers`.
- **Controllers** (`get-users`, `write-users`, `delete-users`, `get-user-item`, `delete-user-two-factor`) — the terminal handlers each route delegates to.
- **`src/modules/users/module.ts`** — the module entry point that mounts this router into the application.
- **Tests** — `src/modules/users/tests/unit/routes.test.ts` exercises route wiring; `tests/cross-cutting/write-routes-are-guarded.test.ts` and `tests/cross-cutting/authenticated-controllers.test.ts` assert that mutations require auth/admin.

## Notes

- **Route order is load-bearing.** `POST /search` is registered before `GET /:id`; reordering will cause "search" to be parsed as a user id.
- **Two spellings for hard-delete.** `DELETE /:id?hardDelete=true` and `DELETE /:id/hard` both reach `deleteUsers` with the same flag; the path form uses `routeFlag` middleware while the query-param form relies on the controller reading the query string. Keep them in sync when changing the flag name.
- **`invalidateCache` tags are always `['users', 'account']`.** If a new cache tag is introduced in `getUserItem` or `getUsers`, every mutation route here must be updated to invalidate it.
- **`uploadLimiter` is only on write routes that accept a file.** The `DELETE` routes and `POST /search` do not pass through the limiter.
