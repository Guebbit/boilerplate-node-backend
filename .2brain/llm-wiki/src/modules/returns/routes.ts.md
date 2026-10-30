---
source: src/modules/returns/routes.ts
sha256: 97dbb06a75efdedaac7203a41055cb14f61e68d567cd3d50991cd282a3ded533
generated_at: 2026-10-29T05:40:35.599668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/routes.ts

## Purpose

Express route table for the returns module. Wires every HTTP endpoint for creating, listing, reading, and transitioning return records, and attaches the per-route policy stack (auth, permission, rate-limit, step-up, idempotency, cache-control) in the correct order.

## Key elements

- **`router`** (export) — the `express.Router` instance; every route is behind `getAuth` → `isAuth` (session required).
- **`needsFreshLogin`** — predicate used by `requireFreshAuthWhen` on `POST /returns`. Returns `true` when the body carries `statedVia` (any caller) or when it is a staff `cancellation` with a non-`withdrawal` reason and the caller holds the `Refund` create ability. Triggers critical-tier step-up.
- **`GET /`** — list returns (staff see all; customers see their own). `privateNoCache`.
- **`POST /`** — create a return or withdrawal. Stack: `returnsWriteLimiter` → `requireFreshAuthWhen(needsFreshLogin, 'critical')` → `idempotencyKey` → controller.
- **`GET /options`** — available return/cancel actions for an order. Declared before `/:id` to avoid the literal "options" being captured as an id.
- **`GET /:id`** — single return, scoped in the service layer.
- **`POST /:id/approve` / `POST /:id/decline`** — staff decision actions; require `update:Return`.
- **`POST /:id/receive`** — goods arrived (pays customer back). Requires `receive:Return` (carries `stepUp: critical` in the key table) + `idempotencyKey`.
- **`POST /:id/close`** — end a received return outside the usual payout path. Same `receive:Return` key; no idempotency (service returns 409 on repeat).
- **`POST /:id/cancel`** — end an approved return whose goods never came. `update:Return`, no step-up, no idempotency (409 on repeat).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen`; the primary auth/permission enforcement for every route.
- **`src/kernel/permissions.ts`** — `callerForSubject` resolves the subject used in the ability check inside `needsFreshLogin`.
- **`src/kernel/ability.ts`** — `holds` performs the RBAC check for the `Refund` ability in `needsFreshLogin`.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` middleware on `POST /` and `POST /:id/receive`.
- **`src/infrastructure/http/middlewares/cache.ts`** — `privateNoCache` on the three read routes.
- **`src/modules/returns/rate-limits.ts`** — `returnsWriteLimiter` applied to `POST /`.
- **`src/modules/returns/controllers/*.ts`** — eight controller handlers, one or two per route (approve/decline share `post-return-decision.ts`).
- **`src/modules/returns/module.ts`** — consumes the exported `router` to mount it in the application.

## Notes

- **Middleware order on `POST /` is load-bearing.** Step-up auth sits *before* `idempotencyKey` so a 401 challenge is not recorded in the idempotency ledger and replayed after re-auth.
- **`/options` must stay above `/:id`.** Express matches in declaration order; moving it after would make the literal string "options" resolve as an id.
- **`needsFreshLogin` reads the raw `request.body`.** It runs before Zod validation in the controller. This is safe only because nothing between `express.json` and the controller mutates the body, and `CreateReturnBody` is a `strictObject` with exact-enum fields (no coercion).
- **No idempotency on close/cancel.** The service returns `409 Conflict` on a second attempt, which is the intended idempotent response; adding an idempotency key would be redundant.
- **`POST /:id/close` reuses the `receive:Return` permission key.** Closing is treated as the tail of the same money-moving act as receiving, hence the same critical step-up.
