---
source: src/modules/tickets/routes.ts
sha256: c8b185bbcd4dfe452acb85d988e513c43d55c61334e0f54c1ac12462460eca6b
generated_at: 2026-10-29T06:05:10.172837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/routes.ts

## Purpose

Defines the Express router for the tickets module. It wires one public route (the visitor contact form) above a single positional auth gate, then mounts all admin-only read/update/delete handlers below that gate. Each route pairs its controller with the specific authorization, caching, and anti-abuse middleware it requires.

## Key elements

- **`router`** (exported) — the `express.Router` instance that `module.ts` mounts into the app.
- **`POST /`** (public) — visitor contact form. Middleware chain: `contactLimiters` → `humanChallengeGate` → `getAuth` → `idempotencyKey` → `postTicket`.
- **`router.use(getAuth, isAuthOrCredential)`** — the single auth gate. Applies only to routes declared *below* it (positional).
- **`POST /search`** — filter-based listing (POST because GET bodies are undefined). Handled by `getTickets`.
- **`GET /`** — unfiltered ticket list. Handled by `getTickets`.
- **`GET /summary`** — badge counts. Handled by `getTicketSummary`.
- **`GET /:id`** — single ticket. Handled by `getTicketById`.
- **Status doors** — `POST /:id/resolve`, `POST /:id/mark-spam`, `POST /:id/reopen`; all handled by `ticket-doors` controllers.
- **Assignment** — `PUT /:id/assignee`, `DELETE /:id/assignee`; handled by `ticket-assignee` controllers.
- **`POST /:id/notes`** — append-only staff thread. Handled by `postTicketNote`.
- **`DELETE /:id`** — hard delete. Handled by `deleteTicket`.

## Relationships

- **`@kernel/middlewares/authorizations`** — supplies `getAuth`, `isAuthOrCredential`, and `requirePermission` used on every route.
- **`@infrastructure/http/middlewares/cache`** — supplies `noStore` (all writes, search, summary) and `privateNoCache` (browser-personal reads: `GET /`, `GET /:id`).
- **`@infrastructure/http/middlewares/human-challenge`** — supplies `humanChallengeGate` (run-3 bot check on the public POST).
- **`@infrastructure/http/middlewares/idempotency`** — supplies `idempotencyKey` for the public POST.
- **`./rate-limits`** — supplies `contactLimiters` (address / email / block budgets).
- **`./controllers/*`** — each imported controller is the terminal handler for its route.
- **`./module.ts`** — registers `router` into the application.
- **`./tests/unit/routes.test.ts`** — exercises route ordering, middleware presence, and permission wiring.

## Notes

- **Auth gate is positional.** `router.use(getAuth, isAuthOrCredential)` only protects routes declared *after* it. The public `POST /` must remain the sole route above the gate. Moving any admin route above the gate silently exposes it. `tests/cross-cutting/authenticated-controllers.test.ts` is the safety net.
- **Route order is load-bearing.** `/search` and `/summary` must precede `/:id` so their literal segments are not swallowed by the parameter.
- **No PATCH.** The status field is read-only; status changes go through the dedicated door endpoints (`resolve`, `mark-spam`, `reopen`).
- **Caching convention.** Shared/sensitive reads and all writes use `noStore` (RFC 9111 §3.5 — staff queue must never sit in a shared cache). Personal reads use `privateNoCache` (browser may cache locally but must revalidate).
- **Public route carries `getAuth`** (not `isAuthOrCredential`) solely to support `idempotencyKey` — the visitor is unauthenticated but still needs a session identity for the idempotency token.
