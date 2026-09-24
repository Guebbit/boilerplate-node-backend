---
source: src/modules/users/routes.ts
sha256: 4e41e2b9f4af46734bad410e7cd62a2e81a90b6b921babade42d797966c9304d
generated_at: 2026-09-23T19:34:16.990266+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Defines the admin-only `/users` Express router, wiring authentication, per-route permission checks, response caching, upload rate-limiting, and file-upload handling to the user CRUD controllers. It is the single entry point that maps HTTP verbs/paths to the module's controller functions.

## Key elements

- **`router`** (exported) – the Express `Router` instance mounted by `module.ts`.
- **`cacheUsersSearch`** – a `searchCache('users', …)` instance whose key parameters match `getUsers`' query schema; applied to `POST /search` and `GET /`.
- **`invalidateUsers`** – shared `invalidateCache(['users', 'account'])` middleware applied to every write/mutation route so both the user search cache and the caller's own `/account` cache are cleared.
- **`POST /users/search`** – search; must be declared before `/:id` routes to avoid the literal "search" being captured as an id.
- **`GET /users`** – list/search users (cached).
- **`POST /users` / `PUT /users` / `PUT /users/:id`** – create or update; run `uploadLimiter` → `invalidateUsers` → `upload.single('imageUpload')` → `writeUsers`.
- **`DELETE /users` / `DELETE /users/:id`** – delete (soft by default; `?hardDelete=true` triggers hard delete).
- **`DELETE /users/:id/hard`** – hard delete spelled in the path; applies `routeFlag('hardDelete')` before delegating to `deleteUsers`.
- **`GET /users/:id`** – single-user read; cached for 3600 s under tag `users`.
- **`DELETE /users/:id/2fa`** – admin-assisted 2FA removal; requires `users.any.update` (not `.delete`).

## Relationships

| Neighbor                                        | Interaction                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `kernel/middlewares/authorizations.ts`          | Supplies `getAuth`, `isAuthOrCredential` (router-wide), and `requirePermission` (per-route).        |
| `infrastructure/http/middlewares/cache.ts`      | Supplies `searchCache`, `setCache`, `invalidateCache` used for read caching and write invalidation. |
| `infrastructure/http/middlewares/rate-limit.ts` | Supplies `uploadLimiter` applied to create/update routes.                                           |
| `infrastructure/http/middlewares/upload.ts`     | Supplies `upload.single('imageUpload')` for avatar/profile-image uploads.                           |
| `infrastructure/http/middlewares/route-flag.ts` | Supplies `routeFlag('hardDelete')` for the `/:id/hard` path.                                        |
| `controllers/get-users.ts`                      | Exports `getUsers` handler and `searchUsersKeyParameters` (cache key shape).                        |
| `controllers/write-users.ts`                    | Exports `writeUsers` handler (create + update).                                                     |
| `controllers/delete-users.ts`                   | Exports `deleteUsers` handler (soft & hard).                                                        |
| `controllers/get-user-item.ts`                  | Exports `getUserItem` handler.                                                                      |
| `controllers/delete-user-two-factor.ts`         | Exports `deleteUserTwoFactor` handler.                                                              |
| `module.ts`                                     | Imports and mounts `router` into the application.                                                   |
| `tests/unit/routes.test.ts`                     | Unit-tests the route table and middleware ordering.                                                 |
| `tests/support/routed-modules.ts`               | Test harness that registers this router for integration tests.                                      |

## Notes

- **Auth strategy:** the router-wide gate is `getAuth` + `isAuthOrCredential` (not `isAuth`), deliberately allowing `sk_…` API keys for partner sync. Each route then asserts its own granular `users.any.*` key—no single key is applied at the router level.
- **Route ordering:** `POST /search` is declared before any `/:id` routes so Express does not match "search" as an id parameter.
- **Two hard-delete entry points:** `DELETE /:id?hardDelete=true` and `DELETE /:id/hard` invoke the same `deleteUsers` controller; the `/hard` path uses `routeFlag` to set the flag programmatically rather than relying on a query string.
- **Cache invalidation scope:** `invalidateUsers` clears both the `users` and `account` tags. Clearing only one would leave the other endpoint serving a stale profile after a mutation.
- **2FA deletion permission:** uses `users.any.update` (not `.delete`), reflecting that removing a second factor is semantically an update to the user record per `shared/authorization-keys.yaml`.
