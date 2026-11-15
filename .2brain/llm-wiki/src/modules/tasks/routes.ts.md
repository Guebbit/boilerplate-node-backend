---
source: src/modules/tasks/routes.ts
sha256: df0b5639d0ac98ad08c0e8f1834fdd76e36f6656ed0132db21c9d28caa95df9f
generated_at: 2026-11-14T22:10:12.680935+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/routes.ts

## Purpose
Defines the Express route table for the tasks module. A single public route (visitor contact form) is mounted above a positional auth gate; everything below that gate is the operator/admin view of visitor submissions (read, status changes, assignment, notes, delete).

## Key elements
- **`router`** (exported) — the Express `Router` instance consumed by the module's HTTP layer.
- **`POST /`** — the sole public endpoint. Middleware chain: `contactLimiters` → `getAuth` → `humanChallengeGate` → `idempotencyKey` → `postTask`.
- **`router.use(getAuth, isAuthOrCredential)`** — positional gate; all routes declared *after* this line are admin-only. The public route above it is exempt by position.
- **Admin routes** (all carry `requirePermission(verb, 'Task')`):
  - `POST /search` — filtered list (DTO with a request body).
  - `GET /` — unfiltered list.
  - `GET /summary` — badge counts.
  - `GET /:id` — single task.
  - `POST /:id/resolve | mark-spam | reopen` — status doors.
  - `POST /:id/assign | unassign` — assignment pair.
  - `POST /:id/notes` — append-only staff thread (uses `idempotencyKey`).
  - `DELETE /:id` — remove entry.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuthOrCredential`, and `requirePermission`, applied per-route as shown above.
- **`src/modules/tasks/controllers/post-task.ts`** — terminal handler for the public `POST /`.
- **`src/modules/tasks/controllers/get-tasks.ts`** — terminal handler for `POST /search` and `GET /`.
- **`src/modules/tasks/controllers/get-task-summary.ts`** — terminal handler for `GET /summary`.
- **`src/modules/tasks/controllers/get-task.ts`** — terminal handler for `GET /:id`.
- **`src/modules/tasks/controllers/post-task-doors.ts`** — exports `postTaskResolve`, `postTaskMarkSpam`, `postTaskReopen` for the three status-door routes.
- **`src/modules/tasks/controllers/post-task-assign.ts`** — terminal handler for `POST /:id/assign`.
- **`src/modules/tasks/controllers/post-task-unassign.ts`** — terminal handler for `POST /:id/unassign`.
- **`src/modules/tasks/controllers/post-task-note.ts`** — terminal handler for `POST /:id/notes`.
- **`src/modules/tasks/controllers/delete-task.ts`** — terminal handler for `DELETE /:id`.
- **`src/infrastructure/http/middlewares/cache.ts`** — `noStore` on all write responses; `privateNoCache` on read responses (browser may cache, must revalidate).
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — `humanChallengeGate` on the public POST, off by default (`NODE_ANTIBOT_PROVIDER`).
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` on the public POST and on `POST /:id/notes`.
- **`src/modules/tasks/rate-limits.ts`** — `contactLimiters` (address, email, address-block dimensions) applied to the public POST.
- **`src/modules/tasks/module.ts`** — mounts this `router` into the application's route tree.

## Notes
- **Positional auth gate.** `router.use(getAuth, isAuthOrCredential)` guards only routes declared *below* it. The single public route must remain the first mount; appending a public route below the gate makes it admin-only, and vice versa. The cross-cutting test `tests/cross-cutting/authenticated-controllers.test.ts` catches misplaced routes.
- **Route ordering within the admin block.** `/search`, `/summary` are mounted before `/:id` so literal path segments are not captured as an id parameter.
- **No PATCH.** The status field is read-only; all state changes are dedicated POST actions (resolve, mark-spam, reopen). See `docs/api/write-methods.md`.
- **GET / as "search."** A GET request body has no defined semantics, so filtered queries use `POST /search`; plain `GET /` returns the unfiltered list.
- **Cache semantics.** Staff-queue data is never Redis-cached (RFC 9111 §3.5). Write responses carry `noStore`; read responses carry `privateNoCache` (browser cache, revalidated each time).
- **Idempotency on notes.** `idempotencyKey` is placed *after* the permission check so a replayed note retries the same append rather than creating a duplicate.
