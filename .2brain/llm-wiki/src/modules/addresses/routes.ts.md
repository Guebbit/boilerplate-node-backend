---
source: src/modules/addresses/routes.ts
sha256: 5c40a5b02720eba49eed8ec2186e9eebc123e044d54dcafda06bce649b6ba439
generated_at: 2026-11-08T04:56:30.697060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/routes.ts

## Purpose
Defines the Express router for the address book, mounted at `/account` alongside the account module's own router. It wires every address CRUD endpoint to its controller handler, applies shared auth and no-cache middleware, and declares which routes require an authenticated session.

## Key elements
- **`router`** (exported) — the Express `Router` instance consumed by `./module.ts`.
- **`router.use(getAuth)`** — resolves the session once for every downstream route; idempotent if an upstream router already ran it.
- **`router.use(noStore)`** — sets `Cache-Control: no-store` on all responses (identity/credential-adjacent data).
- **`GET /addresses`** → `getAddresses` — list the caller's book.
- **`POST /addresses`** → `postAddress` — create an entry.
- **`GET /addresses/:addressId`** → `getAddress` — fetch one entry.
- **`PUT /addresses/:addressId`** → `replaceAddress` — full replacement of the entry.
- **`PATCH /addresses/:addressId`** → `updateAddress` — partial field merge.
- **`PUT /addresses/:addressId/default`** → `putAddressDefault` — set the book-level default pointer.
- **`DELETE /addresses/:addressId`** → `deleteAddress` — remove an entry.

All routes (except the two `router.use` calls) also pass through `isAuth` as a per-route guard.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth` (session resolution middleware) and `isAuth` (per-route auth guard).
- **`src/infrastructure/http/middlewares/cache.ts`** — source of `noStore` (sets `Cache-Control: no-store`).
- **`src/modules/addresses/controllers/*`** — each handler function imported and bound to its route (see list above).
- **`src/modules/addresses/module.ts`** — mounts this `router` at `/account` next to the account module's own router.
- **`src/modules/addresses/tests/unit/routes.test.ts`** — unit tests exercising this router's route table and middleware chain.

## Notes
- The base path is `/account`, not `/addresses`; the address sub-paths are relative to that mount point.
- `PUT` (replace) and `PATCH` (merge) are intentionally distinct verbs hitting the same `:addressId` path — the `update-address.ts` controller exports both `replaceAddress` and `updateAddress` for this split.
- `putAddressDefault` lives on its own route (`…/default`) because the default pointer is a property of the *book*, not a field on a single address; it is modeled as a separate action rather than a field mutation.
- `getAuth` is safe to stack: it short-circuits when an auth context is already present, so mounting it here adds no cost beyond the first router that ran it.
