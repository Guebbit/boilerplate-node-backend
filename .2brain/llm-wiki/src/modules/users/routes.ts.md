---
source: src/modules/users/routes.ts
sha256: b53a08008fe03717c20815a1dbe97c2c4e6afc3f134bf641db64a6a9715e17d3
generated_at: 2026-11-14T22:25:42.226977+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Express router that mounts every admin-facing `/users` endpoint (search, CRUD, purchase-hold, activation, restore, hard-delete). It wires each route to the correct permission check, cache headers, upload handling, and conditional re-authentication so that individual controllers stay free of routing concerns.

## Key elements

- **`router`** – The exported Express `Router`. All user-management routes are attached here; the module exports nothing else.
- **`changesPowers(request)`** – Guard predicate (returns `Promise<boolean>`) used by `requireFreshAuthWhen` on `POST /users`. Returns `true` only when the caller holds `assign:Role` **and** the body sets `role` or flips `active` to `false`, triggering a critical-tier fresh-session prompt.
- **`switchesAccount(request)`** – Guard predicate for `POST /:id/activate` and `POST /:id/deactivate`. Returns `true` whenever the caller holds `assign:Role`, forcing a critical re-auth on any role-manager activation/deactivation toggle.
- **Router-level middleware** – `getAuth` + `isAuthOrCredential` (not `isAuth`) so `sk_…` API keys are accepted; each individual route adds its own `requirePermission(…)`.
- **Cache middleware usage** – `noStore` on `POST /search`, `privateNoCache` on `GET /` and `GET /:id`; all other responses inherit Express defaults.
- **`routeFlag('hardDelete')`** – Attached only to `DELETE /:id/hard`, providing the hard-delete flag to the `deleteUsers` handler.
- **`uploadLimiter` + `upload.image()`** – Rate-limit and multipart parsing applied to `POST /`, `PUT /:id`, and `PATCH /:id`.

## Relationships

- **`src/modules/users/controllers/*`** – Each controller function (`getUsers`, `getUserItem`, `createUser`, `replaceUser`, `updateUser`, `deleteUsers`, `restoreUsers`, `postPlacePurchaseHold`, `postLiftPurchaseHold`, `postActivate`, `postDeactivate`) is the terminal handler for one or more routes defined here.
- **`src/kernel/ability.ts`** – `holds(caller, 'assign', 'Role')` is called inside both guard predicates to decide whether fresh auth is required.
- **`src/kernel/middlewares/authorizations.ts`** – Supplies `getAuth`, `isAuthOrCredential`, `requirePermission`, and `requireFreshAuthWhen`, which form the auth/permission chain on every route.
- **`src/infrastructure/http/middlewares/cache.ts`** – `noStore` and `privateNoCache` set `Cache-Control` on the respective responses.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – `uploadLimiter` throttles the three image-writing routes.
- **`src/infrastructure/http/middlewares/upload.ts`** – Provides the `upload` middleware whose `image()` method parses multipart form data before the handler runs.
- **`src/infrastructure/http/middlewares/route-flag.ts`** – `routeFlag('hardDelete')` supplies the flag that `deleteUsers` reads to choose hard vs. soft delete.

## Notes

- **Route order matters**: `POST /search` is declared before `GET /:id` to prevent the literal string `"search"` from being captured as an `:id` parameter.
- **No single router-level permission key** is used. A previous design gated the whole router on one key, which blocked callers holding a different (but valid) permission. Each route now states its own `requirePermission(…)`.
- **`changesPowers` reads `request.body`**, so it must appear *after* `upload.image()` in the middleware chain; multipart bodies are only populated once the upload middleware has run.
- **`active` is checked as both `false` and `'false'`** because a multipart body delivers booleans as strings until the validator converts them.
- The hard-delete endpoint (`DELETE /:id/hard`) is functionally identical to `DELETE /:id?hardDelete=true`; it exists so the destructive intent is visible in the path rather than hidden in a query string.
