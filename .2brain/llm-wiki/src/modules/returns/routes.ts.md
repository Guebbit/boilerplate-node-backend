---
source: src/modules/returns/routes.ts
sha256: 4659518351a19feea02caff361389149dc61a9719f834025e89caf75d1d98f20
generated_at: 2026-10-15T11:55:00.210532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/routes.ts

## Purpose

Express route table for the returns module. It wires every return endpoint to the correct authentication, permission, rate-limiting, caching, and idempotency middleware, then delegates to the corresponding controller. It exists so that the module's HTTP surface is declarative and auditable in one place.

## Key elements

- **`router`** (exported `Router`) – the single HTTP entry point for `/returns`. All routes inherit `getAuth` + `isAuth` via `router.use`.
- **`isStaffCancellation`** (local predicate) – returns `true` when the request body has `kind: 'cancellation'` **and** the caller holds the `payments.any.update` ability key. Used as the condition for `requireFreshAuthWhen` on `POST /` so that only a staff-initiated refund triggers a `stepUp: critical` prompt; a buyer's own withdrawal passes through silently.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/middlewares/authorizations` | Supplies `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen` used on every route. |
| `@kernel/permissions` | `callerForSubject` resolves the caller's identity for the ability check inside `isStaffCancellation`. |
| `@kernel/ability` | `holdsKey` evaluates whether the caller possesses `payments.any.update`. |
| `@infrastructure/http/middlewares/idempotency` | `idempotencyKey` middleware on `POST /` and `POST /:id/receive` to ensure at-most-once side effects. |
| `@infrastructure/http/middlewares/cache` | `privateNoCache` on all `GET` routes so per-caller responses are never cached. |
| `./rate-limits` | `returnsWriteLimiter` throttles `POST /` before idempotency and controller logic run. |
| `./controllers/post-return` | Handles `POST /`. |
| `./controllers/get-returns` | Handles `GET /`. |
| `./controllers/get-return-options` | Handles `GET /options`. |
| `./controllers/get-return-by-id` | Handles `GET /:id`. |
| `./controllers/post-return-decision` | `postReturnApprove` / `postReturnDecline` handle `POST /:id/approve` and `POST /:id/decline`. |
| `./controllers/post-return-receive` | Handles `POST /:id/receive`. |
| `src/modules/returns/module.ts` | Consumes the exported `router` to register routes under the module's mount path. |
| `src/modules/returns/tests/unit/routes.test.ts` | Unit-tests the route wiring, middleware ordering, and permission assertions defined here. |
| `tests/cross-cutting/step-up-auth-routes.test.ts` | Verifies that `requireFreshAuthWhen` fires (or is skipped) correctly on `POST /` depending on the caller's key and body `kind`. |

## Notes

- **Route order is significant.** `GET /options` is declared before `GET /:id`; swapping them would make the literal string `"options"` match the `/:id` param.
- **`isStaffCancellation` reads `request.body`.** This is safe only because the application mounts a body parser globally before any module router. Do not move this guard ahead of parsing.
- **Middleware order on `POST /`:** `returnsWriteLimiter` → `idempotencyKey` → `requireFreshAuthWhen` → `postReturn`. The limiter is first so a rate-limited burst does not consume an idempotency key; the idempotency key is before the step-up prompt so a replay that passes the key does not re-trigger a session challenge.
- **`POST /:id/receive`** requires the `returns.any.receive` permission (which carries `stepUp: critical` in `shared/authorization-keys.yaml`) *and* an `Idempotency-Key`. The permission gate is before the idempotency gate: an unauthorised caller is rejected without touching the idempotency store.
