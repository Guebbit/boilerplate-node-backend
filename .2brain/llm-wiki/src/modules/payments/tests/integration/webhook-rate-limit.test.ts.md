---
source: src/modules/payments/tests/integration/webhook-rate-limit.test.ts
source_sha256: c42e763b335b82a4e2af711e5f7806fece8d543e35bf07a083bd97dfa1df8a1c
context_sha256: 8a5ba77203660311babb69252651cfde0b8c99d968742f3f09dcc5474b4f815c
generated_at: 2026-11-22T07:04:27.078319+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/webhook-rate-limit.test.ts

## Purpose
Integration test of the payment webhook's rate-limit budget over real HTTP. It wires the real limiter (`webhookLimiter`) and the real controller (`postPaymentWebhook`) into a small Express app and checks that only refused (forged) deliveries spend the budget, per address block (/24), and that a refusal writes no audit row. A delivery naming no intent applies nothing, so no database is needed.

## Key elements
- `CAP` — the limiter cap used in tests (3), low enough to cross quickly. Passed as `NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX`.
- `loadWebhook()` — loads `@modules/payments/rate-limits` fresh through `withReloadedRateLimits` with the cap set, then imports `auditLogger` from the fresh registry and registers `fakePaymentProvider`. It builds the app: `trust proxy` = 1, a JSON body parser with a `verify` hook storing `rawBody`, `attachLocale`, and `POST /payments/webhook/:provider` with `webhookLimiter` then `postPaymentWebhook`. Returns `{ app, auditLogger }`.
- `deliver(loaded, address, signed)` — sends one supertest POST to `/payments/webhook/fake` with `X-Forwarded-For: address`. The body is `{"id":"evt_limit"}`. The signature header is a valid `signWebhookPayload(body)` or the forged `t=1,v1=forged`.
- `inOneBlock(count)` — generates `count` distinct addresses `203.0.113.N` inside one /24.
- `statusesOf(loaded, addresses, signed)` — sends deliveries sequentially and returns their status codes. Sequential because the budget is order-sensitive.
- Test cases:
  - Forgeries rotating addresses in one /24 give `[400, 400, 400, 429, 429]`.
  - The 429 refusal triggers no `auditLogger.log` call (spied).
  - Signed deliveries from one address stay `204` past the cap.
  - A different block (`198.51.100.9`) is unaffected and still gets `400`.

## Relationships
- `tests/support/rate-limit-harness.ts` — supplies `withReloadedRateLimits` (imported as `@tests/rate-limit-harness`), which reloads the limits module with env overrides.
- `src/modules/payments/rate-limits.ts` — provides `webhookLimiter`, the unit under test.
- `src/modules/payments/controllers/post-payment-webhook.ts` — the real controller behind the limiter.
- `src/modules/payments/providers/index.ts` — provides `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`.
- `src/modules/payments/providers/registry.ts` — `registerPaymentProvider` registers the fake provider.
- `scenarios/support/doubles/payments/fake.ts` — supplies `fakePaymentProvider`, served at `/payments/webhook/fake`.
- `src/infrastructure/http/middlewares/locale.ts` — `attachLocale` supplies the locale needed for the controller's translated refusal copy.
- `src/infrastructure/adapters/logger.ts` — `auditLogger` is spied on to assert no audit writes.

## Notes
- `rateLimit()` reads its config once, so the limiter must be imported after the cap is set. Hence the fresh load per test via the harness.
- The controller and i18n deliberately stay on the original module registry because i18next is booted there. A reset would leave `t()` with no dictionaries. `auditLogger` is instead taken from the fresh registry, since that is the one the limiter writes to.
- `afterEach` restores mocks and `afterAll` calls `jest.resetModules()`.
- `webhook-signature.ts` is not imported directly. Signing goes through the `providers` index.
