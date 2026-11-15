---
source: src/modules/users/role-routes.ts
sha256: 92e68aedb6c1d5a5e17d23829b747f798bc0d98fee03895aefff94cbac765e81
generated_at: 2026-11-14T22:25:13.485927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/role-routes.ts

## Purpose

Dedicated Express router that exposes the only two staff-role mutation endpoints — `POST /users/:id/assign-role` and `POST /users/:id/revoke-role`. It exists as a separate router (rather than living in `./routes`) so that it can require `isAuth` exclusively, rejecting API-key callers with a 401 before any role logic runs.

## Key elements

- **`router`** (export) — the sole export; an Express `Router` instance with two `POST` routes.
- **`/:id/assign-role`** — grants the named role to an existing account. Guard chain: `getAuth → isAuth → requirePermission('assign','Role') → postAssignRole`.
- **`/:id/revoke-role`** — removes the account's staff role. Same guard chain, terminating in `postRevokeRole`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, and `requirePermission`; the three middlewares that gate every route in this file.
- **`src/modules/users/controllers/post-user-role.ts`** — provides the two controller handlers (`postAssignRole`, `postRevokeRole`) that execute after the guards pass.
- **`src/modules/users/module.ts`** — mounts this router *after* the general `./routes` router, ensuring a key's request is answered by the earlier router (401) and never reaches the `isAuth` guard here.
- **`src/modules/users/tests/unit/role-routes.test.ts`** — unit tests for the two routes and their guard ordering.

## Notes

- Guards are attached **per route**, not on the router itself, so a stray key request to any other `/users` path is handled by the earlier router and never short-circuited to a 401 from this file.
- `assign:Role` is declared `credential: false` in the access model; the router's choice of `isAuth` (vs. `isAuthOrCredential`) is the enforcement point. The permission rule itself also carries the step-up requirement and the `ROLE_MANAGEMENT_REQUIRED` refusal — no extra middleware is needed.
- No `If-Match` / ETag concurrency control: the last caller naming different roles wins; a repeat of the same role returns **409**.
