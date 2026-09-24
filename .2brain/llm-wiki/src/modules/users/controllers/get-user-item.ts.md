---
source: src/modules/users/controllers/get-user-item.ts
sha256: 0f3c22bf3f0760fcfdd095362c684c544d1b341ac8c1bbcced622cfb5af12eed
generated_at: 2026-09-23T19:32:01.667823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-user-item.ts

## Purpose

Controller for `GET /users/:id` — resolves a single user document by path id and returns it under the user contract shape. Admin-only. Exists as a thin adapter between the route layer and `userService`.

## Key elements

- **`getUserItem`** (exported) — the route handler, produced by `createItemController`. Config:
    - `entity: 'user'` — used by the factory for logging / response metadata.
    - `notFoundKey: 'users.not-found'` — i18n key returned as a 404 when the fetch yields `undefined`.
    - `fetch: (id) => …` — calls `userService.getById(id)`; on a hit, maps through `userService.toUserContract(user)`; on a miss, returns `undefined` (the factory converts that to the 404 response).

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — supplies the `createItemController` factory. The factory handles request parsing (extracting `:id`), error wrapping, and the 404 convention; this file only provides the entity name, i18n key, and the fetch closure.
- **`src/modules/users/routes.ts`** — registers `getUserItem` as the handler for the `GET /users/:id` route.
- **`src/modules/users/service.ts`** — provides `userService.getById` (database lookup) and `userService.toUserContract` (shape + role-enrichment mapping).

## Notes

- `toUserContract` reads the caller's **current** role from the membership store on every call; the user document itself carries no role. This adds one indexed lookup per read, but is consistent with the authorization checks the endpoint already requires.
- The `undefined` return path is intentional: `createItemController` interprets a falsy fetch result as "not found" and emits the `notFoundKey` message. Do not return `null` or an empty object to signal absence — the factory only checks truthiness.
