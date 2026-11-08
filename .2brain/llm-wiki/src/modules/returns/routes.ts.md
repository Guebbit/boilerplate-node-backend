---
source: src/modules/returns/routes.ts
sha256: 30864c0f4f53fb08d12b61ca7bb50b1be72296966f71e298a5bcb41a5d8d1e36
generated_at: 2026-11-08T08:01:28.191961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/routes.ts

## Purpose

Defines the Express route table for the returns module. Every route sits behind the auth wall (`getAuth` + `isAuth` applied globally on the router) and layers the correct combination of permission checks, step-up authentication, idempotency, rate limiting, and cache-control middleware in front of each controller.

## Key elements

- **`needsFreshLogin(request)`** — Predicate deciding whether a `POST /` needs a fresh (`critical`-tier) session. Triggers when the body carries `statedVia` (a staff-recorded withdrawal, a legal act) or when it is a staff `cancellation` (non-withdrawal) and the caller holds `create:Refund`. Buyer self-withdrawal (`reason: 'withdrawal'`) is explicitly exempt.
- **`router`** (export) — The Express `Router` consumed by the returns module. Route list:
  - `GET /` → `getReturns` (list; `privateNoCache`)
  - `POST /` → `postReturn` (open/withdraw; `returnsWriteLimiter` → `requireFreshAuthWhen` → `idempotencyKey`)
  - `GET /options` → `getReturnOptions` (per-order options; `privateNoCache`)
  - `GET /:id` → `getReturnById` (single return; `privateNoCache`)
  - `POST /:id/approve` → `postReturnApprove` (`update:Return`)
  - `POST /:id/decline` → `postReturnDecline` (`update:Return`)
  - `POST /:id/receive` → `postReturnReceive` (`receive:Return`, `stepUp: critical`, `idempotencyKey`)
  - `POST /:id/close` → `postReturnClose` (`receive:Return`, `stepUp: critical`)
  - `POST /:id/cancel` → `postReturnCancel` (`update:Return`)

## Relationships

- **`@kernel/middlewares/authorizations`** — Source of `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen`; the auth/permission layer applied on every route.
- **`@kernel/permissions`** — `callerForSubject` maps the resolved auth context to a permission subject inside `needsFreshLogin`.
- **`@kernel/ability`** — `holds` checks whether the caller carries `create:Refund` for the staff-cancellation fresh-session gate.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` middleware guards `POST /` and `POST /:id/receive` against duplicate side-effects.
- **`@infrastructure/http/middlewares/cache`** — `privateNoCache` prevents CDN/proxy caching of per-caller `GET` responses.
- **`./rate-limits`** — `returnsWriteLimiter` throttles `POST /`.
- **`./controllers/*`** — Each route's terminal handler (nine controller imports).
- **`./module.ts`** — Registers this router into the app's routing tree.

## Notes

- **Route order matters:** `GET /options` is declared before `GET /:id` so the literal `"options"` segment is not swallowed as an `:id` parameter.
- **Middleware ordering on `POST /`:** `requireFreshAuthWhen` is placed *before* `idempotencyKey` deliberately. The idempotency ledger records whatever JSON response it sees; a 401 step-up challenge emitted *behind* it would be stored and replayed as the "answer" for that key after the user re-authenticates.
- **`needsFreshLogin` reads the raw body** (`request.body`) before any controller runs. This is safe because only `express.json` parses the body, nothing rewrites it in between, and `CreateReturnBody` is a strict exact-enum object with no coercion.
- **No idempotency on `close` / `cancel`:** Both are naturally idempotent at the state-machine level — a second call finds the return already closed/canceled and returns 409, so a separate idempotency key adds no protection.
- **Buyer withdrawal is never step-up prompted.** The exemption is encoded as a deny on the one exempt reason (`'withdrawal'`); a missing, wrong-cased, or array reason fails closed (prompts), then the schema rejects it with 422.
