---
source: src/modules/returns/routes.ts
source_sha256: 4a95db6c530396e41d25f3a55f2082036cdecbfd39826015eaa3d72730cb9c30
context_sha256: 76178f9488eaf45caa065373fe20474429517fad7d31c56a38262e89efd19b0e
generated_at: 2026-11-22T07:27:30.040846+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/routes.ts

## Purpose
Express route table for the returns module. Every route sits behind authentication. Customer-facing routes (open, list, read) need only a session and are scoped to the caller's own orders by the service. Staff routes require the permission key that names the action. Money-moving and legal-record paths additionally demand a fresh session (step-up).

## Key elements
- **`router`** (export): the Express `Router`. It starts with `router.use(getAuth, isAuth)`, so every route requires a signed-in user.
- **`needsFreshLogin(request)`**: predicate for `requireFreshAuthWhen`. It returns true when:
  - the body carries `statedVia`, regardless of who sends it (fails closed), or
  - the body has `kind: 'cancellation'`, a reason other than `withdrawal`, and the caller holds `create:Refund` (checked via `holds(callerForSubject(authContext, 'Return'), ...)`).

  A buyer's own withdrawal is never prompted.
- **Routes:**

| Route | Guards | Handler |
|---|---|---|
| `GET /` | `privateNoCache` | `getReturns` |
| `POST /` | `returnsWriteLimiter`, `requireFreshAuthWhen(needsFreshLogin, 'critical')`, `idempotencyKey` | `postReturn` |
| `GET /options` | `privateNoCache` | `getReturnOptions` |
| `GET /:id` | `privateNoCache` | `getReturnById` |
| `POST /:id/approve` | `requirePermission('update','Return')` | `postReturnApprove` |
| `POST /:id/decline` | `requirePermission('update','Return')` | `postReturnDecline` |
| `POST /:id/receive` | `requirePermission('receive','Return')`, `idempotencyKey` | `postReturnReceive` |
| `POST /:id/proof-of-sending` | `requirePermission('receive','Return')` | `postReturnProof` |
| `POST /:id/close` | `requirePermission('receive','Return')` | `postReturnClose` |
| `POST /:id/cancel` | `requirePermission('update','Return')` | `postReturnCancel` |

## Relationships
- **`@kernel/middlewares/authorizations`**: supplies `getAuth`, `isAuth`, `requirePermission` and `requireFreshAuthWhen`. `requirePermission` demands and audits the step-up tier declared on a key.
- **`@kernel/permissions`** (`callerForSubject`) and **`@kernel/ability`** (`holds`): used by `needsFreshLogin` to check whether the caller holds the refund key.
- **`@infrastructure/http/middlewares/idempotency`**: `idempotencyKey` is applied to `POST /` and `POST /:id/receive`.
- **`@infrastructure/http/middlewares/cache`**: `privateNoCache` is applied to the per-caller GET routes.
- **`./rate-limits`**: `returnsWriteLimiter` guards `POST /`.
- **`./controllers/*`**: one handler per route, as in the table above. `post-return-decision.ts` exports both approve and decline.
- **`module.ts`**: the module wiring, which presumably mounts this `router`. The mount is not visible in this file.

## Notes
- **Middleware order on `POST /`:** the rate limiter comes first, so a spent budget costs no write. The step-up check comes before `idempotencyKey`. The idempotency ledger records any JSON answer, so a 401 challenge placed behind it would be replayed for the same key after re-authentication.
- **Route order:** `/options` is declared before `/:id` so that "options" is not read as an id.
- **Step-up through the key:** `receive:Return` carries `stepUp: critical` in `shared/authorization-keys.generated.yaml`. Receiving, `proof-of-sending` and `close` all use this key, so all three inherit the step-up. `approve`, `decline` and `cancel` use `update:Return`, which has no step-up because no money or stock moves.
- **Idempotency:** only `POST /` and `receive` use `idempotencyKey`. `proof-of-sending`, `close` and `cancel` rely on a second call answering 409.
- **Fail-closed body check:** `needsFreshLogin` reads the raw request body. The file's comment says this is safe because nothing rewrites the body before the controller and `CreateReturnBody` is an exact-enum `strictObject` with no coercion. A missing, array-valued or wrong-case reason prompts for a fresh login and is then refused by the body schema.
- **`statedVia` handling:** a buyer who sends `statedVia` is prompted for a fresh login, and the service then refuses the field with a 422.
