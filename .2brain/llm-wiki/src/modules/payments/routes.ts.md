---
source: src/modules/payments/routes.ts
sha256: bbdde545983067a195e60c99ad817bdf1176210b8558ee89bb1008876afaf130
generated_at: 2026-10-15T11:28:58.230816+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/routes.ts

## Purpose

Express router that wires every payment endpoint to its controller, applying the correct sequence of auth, permission, rate-limit, and idempotency middleware per route. It encodes the layered security policy (public → session → role → fresh-auth → cart-verification → velocity → idempotency) so individual controllers stay purely about business logic.

## Key elements

- **`router`** (default export) — `express.Router()` instance mounted at the payments path.
- **`POST /webhook`** — Provider callback; uses `webhookLimiter` only (no session auth, body-signed by the provider). Must remain above the auth wall.
- **`GET /methods`** — Public; lists available payment methods (same rationale as `GET /delivery/methods`).
- **`GET /` and `POST /search`** — Staff payment list; `payments.any.read` (exact) + `privateNoCache` / `noStore`.
- **`GET /refunds`**, **`GET /attention`** — Staff read views; same permission and cache guards.
- **`POST /intent`** — Freezes an order price. Requires `requireFreshAuth('critical')`, `cart.self.update`, `cart.self.checkout`, `paymentIntentLimiter`. No idempotency key (re-request refreshes the same intent; key would store `clientSecret`).
- **`GET /order/:orderId`** — Payment behind a specific order.
- **`GET /order-by-reference`** — Admin RF-code lookup; `payments.any.create`.
- **`POST /order/:orderId/refund`** — Operator-initiated refund. `payments.any.update` (carries `stepUp: critical` in the YAML key table) + **required** idempotency key.
- **`POST /order/:orderId/offline`** — Manual offline record. `payments.any.create` (same `stepUp` pattern) + optional idempotency key.
- **`POST /:id/confirm`** — Card validation / charge. `requireFreshAuth('critical')`, both `cart` permissions, three velocity limiters (`Attempt`, `Decline`, `DeclineBlock`), `paymentDeclineChallengeGate`, optional idempotency key.
- **`POST /:id/sync`** — Browser reports provider-side completion. Same auth stack as `/intent`; no idempotency key (idempotent by provider reference).

## Relationships

- **`@kernel/middlewares/authorizations`** — Supplies `getAuth`, `isAuth` (the auth wall), `requirePermission`, and `requireFreshAuth`.
- **`@infrastructure/http/middlewares/idempotency`** — Supplies `idempotencyKey` (optional) and `requireIdempotencyKey` (mandatory) for refund and confirm.
- **`@infrastructure/http/middlewares/cache`** — Supplies `noStore` and `privateNoCache` for staff-facing GETs.
- **`./rate-limits`** — Supplies `webhookLimiter`, `paymentIntentLimiter`, `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`.
- **Twelve controllers** under `./controllers/` — Each route delegates its handler to exactly one controller function (e.g. `postPaymentConfirm`, `getPaymentMethods`).

## Notes

- **Route ordering matters.** `/webhook` and `/methods` must precede `router.use(getAuth, isAuth)`; all other routes must follow it. Moving them breaks the public/authenticated split.
- **`/order-by-reference` is a literal segment**, deliberately not matched by `/order/:orderId`. The `:orderId` param routes are all POSTs on a longer path, so there is no collision, but the naming is intentional.
- **`stepUp` is defined in `shared/authorization-keys.yaml`, not here.** `payments.any.update` and `payments.any.create` carry `stepUp: critical`, so the router does *not* also call `requireFreshAuth` on refund/offline; the key table enforces it. Adding a new route that uses those keys inherits the fresh-session requirement for free.
- **`/intent` has no idempotency key by design** — a second call refreshes the same intent, and storing the response would persist the `clientSecret` in the idempotency ledger.
- **`/sync` has no idempotency key** because it is idempotent by construction (keyed on the provider's payment reference).
- **`/confirm` stacks three separate limiters plus a challenge gate** between identity guards and idempotency, mirroring the `credentialLimiters` + `loginChallengeGate` pattern on `POST /account/login`.
- **Staff GETs use `privateNoCache` / `noStore`** (RFC 9111 §3.5 POST rule extended to sensitive GETs) because the responses contain the shop's entire payment state.
