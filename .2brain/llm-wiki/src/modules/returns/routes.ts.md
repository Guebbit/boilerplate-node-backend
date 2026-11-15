---
source: src/modules/returns/routes.ts
sha256: 7a189d354effe8aac61ed9400ab5a309b314fbfca9edf49923b039f4f90d70a6
generated_at: 2026-11-14T21:36:13.677053+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/routes.ts

## Purpose

Express route table for the returns module. Wires every HTTP endpoint (create, read, approve, decline, receive, proof, close, cancel) to its controller, layers the shared authentication/authorization middleware, and applies route-specific guards (rate limiting, idempotency, conditional step-up, no-cache) in a deliberate order that prevents replay and fail-open edge cases.

## Key elements

- **`router`** (exported `Router`): the single Express router registered by the returns module. All sub-paths are relative to `/returns`.
- **`needsFreshLogin(request)`**: local predicate deciding whether a `POST /returns` body demands a critical-tier fresh session. Returns `true` when the body carries `statedVia` (recorded withdrawal) *or* when it is a `cancellation` with a non-`withdrawal` reason **and** the caller holds the `create:Refund` ability. Used as the condition for `requireFreshAuthWhen`.
- **Route order matters**: `GET /options` is declared before `GET /:id` so the literal string "options" is not captured as an id.
- **Middleware ordering on `POST /`**: `returnsWriteLimiter` → `requireFreshAuthWhen` → `idempotencyKey` → controller. The step-up sits *before* idempotency so a 401 challenge is not replayed as a cached idempotent response.
- **Money-related routes** (`/:id/receive`, `/:id/proof-of-sending`, `/:id/close`) all use the `receive:Return` permission key, which carries `stepUp: critical` in the generated authorization-keys file. `receive` additionally requires an `Idempotency-Key`; the other two rely on a 409 on double-invocation instead.
- **`privateNoCache`** is applied to every `GET` route because responses are caller-scoped.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen`; applied at router level and per-route.
- **`src/kernel/permissions.ts`** — `callerForSubject` is called inside `needsFreshLogin` to build the ability subject for the refund-key check.
- **`src/kernel/ability.ts`** — `holds` is called inside `needsFreshLogin` to verify the caller's `create:Refund` permission.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` guard on `POST /` and `POST /:id/receive`.
- **`src/infrastructure/http/middlewares/cache.ts`** — `privateNoCache` on all four `GET` routes.
- **`src/modules/returns/controllers/post-return.ts`** — `postReturn` handles `POST /`.
- **`src/modules/returns/controllers/get-returns.ts`** — `getReturns` handles `GET /`.
- **`src/modules/returns/controllers/get-return.ts`** — `getReturnById` handles `GET /:id`.
- **`src/modules/returns/controllers/get-return-options.ts`** — `getReturnOptions` handles `GET /options`.
- **`src/modules/returns/controllers/post-return-decision.ts`** — `postReturnApprove` / `postReturnDecline` handle the approve and decline routes.
- **`src/modules/returns/controllers/post-return-receive.ts`** — `postReturnReceive` handles `POST /:id/receive`.
- **`src/modules/returns/controllers/post-return-proof.ts`** — `postReturnProof` handles `POST /:id/proof-of-sending`.
- **`src/modules/returns/controllers/post-return-close.ts`** — `postReturnClose` handles `POST /:id/close`.
- **`src/modules/returns/controllers/post-return-cancel.ts`** — `postReturnCancel` handles `POST /:id/cancel`.
- **`src/modules/returns/module.ts`** — imports and mounts this `router` onto the application.

## Notes

- `needsFreshLogin` inspects `request.body` directly. This is safe only because `express.json` is the sole body parser and `CreateReturnBody` is a strict, non-coercing enum schema; no upstream middleware rewrites the body. If a new middleware parses or mutates the body before this route, the check can break silently.
- The buyer's own withdrawal (`reason: 'withdrawal'`) is deliberately excluded from the fresh-session requirement; only the *staff* remainder-cancel path triggers it.
- `POST /:id/cancel` uses the `update:Return` key (no step-up) because it moves neither money nor stock; the other "money" routes use `receive:Return`.
- `Idempotency-Key` is intentionally absent on `proof-of-sending`, `close`, and `cancel` — each controller answers 409 on a duplicate rather than relying on idempotency middleware.
