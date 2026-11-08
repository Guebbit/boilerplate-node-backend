---
source: src/modules/tasks/routes.ts
sha256: cdd321de2a4b107a8646f94245de132d6dc6de4b5dc08dda416f7f7bfbf6d23e
generated_at: 2026-11-08T08:36:30.756280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/routes.ts

## Purpose

Express route table for the tasks module. It exposes exactly one public endpoint (the visitor contact-form `POST /`) and, below a positional auth gate, a set of admin-only read/update/delete routes for staff to triage, assign, and manage submitted tasks.

## Key elements

- **`router`** (exported) — the single `express.Router` consumed by `src/modules/tasks/module.ts`. All task endpoints live here.
- **`POST /`** — public contact form. Middleware chain: `contactLimiters → getAuth → humanChallengeGate → idempotencyKey → postTask`.
- **`router.use(getAuth, isAuthOrCredential)`** — positional auth gate; every route declared *below* this line is admin-only.
- **`POST /search`** — filtered task listing (POST used because the query carries a body). Requires `read Task`.
- **`GET /`** — unfiltered task list. Requires `read Task`.
- **`GET /summary`** — badge counts for the staff UI. Requires `read Task`.
- **`GET /:id`** — single task detail. Requires `read Task`.
- **`POST /:id/resolve` / `/:id/mark-spam` / `/:id/reopen`** — the three status "doors"; one action per effect, no body. Require `update Task`.
- **`PUT /:id/assignee`** / **`DELETE /:id/assignee`** — assign-to-self / unassign. Require `update Task`.
- **`POST /:id/notes`** — append-only staff thread. Requires `update Task`.
- **`DELETE /:id`** — hard-delete a task. Requires `delete Task`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuthOrCredential`, and `requirePermission`, which gate every route here.
- **`src/modules/tasks/rate-limits.ts`** — supplies `contactLimiters`, the three-dimensional budget (address, email, address-block) applied to the public `POST /` before any write.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — supplies `humanChallengeGate` (rung-3 antibot), applied only to the public `POST /`.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies `idempotencyKey`, applied to the public `POST /` to make the write idempotent.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies `noStore` (write responses, `/summary`, staff queue) and `privateNoCache` (browser-cacheable reads like `GET /` and `GET /:id`).
- **Controllers** (`post-task`, `get-tasks`, `get-task`, `get-task-summary`, `post-task-doors`, `put-task-assignee`, `delete-task-assignee`, `post-task-note`, `delete-task`) — each is the terminal handler for one or more routes declared in this file.
- **`src/modules/tasks/module.ts`** — registers this `router` into the application.

## Notes

- **Positional auth is load-bearing.** The public `POST /` is mounted *above* `router.use(getAuth, isAuthOrCredential)`. Any route accidentally inserted between the public route and the `router.use` call becomes admin-only; any route below the `router.use` that *should* be public will be rejected. The cross-cutting test `tests/cross-cutting/authenticated-controllers.test.ts` is the safety net for this.
- **Route order prevents path collision.** `/search` and `/summary` are declared before `/:id` so those literal segments are not swallowed as an id.
- **No `PATCH`.** The task status field is read-only from the API's perspective; status changes go through the dedicated `resolve` / `mark-spam` / `reopen` doors.
- **`noStore` vs `privateNoCache`.** Write responses and the shared staff queue use `noStore` (RFC 9111 §3.5 — a shared cache must never hold it). Browser-viewable reads (`GET /`, `GET /:id`) use `privateNoCache` (browser may cache privately, revalidates every time).
- **`POST /search` exists because `GET` has no defined body semantics.** It is the same `getTasks` handler as `GET /`, distinguished only by the presence of filter parameters in the request body.
