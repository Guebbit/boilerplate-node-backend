---
source: src/modules/payments/tests/integration/webhook-rate-limit.test.ts
sha256: c42e763b335b82a4e2af711e5f7806fece8d543e35bf07a083bd97dfa1df8a1c
generated_at: 2026-11-14T21:21:23.716292+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/webhook-rate-limit.test.ts

## Purpose

Integration test that exercises the payment webhook's rate-limit budget over a real HTTP stack (supertest + Express). It verifies three properties of the real limiter and real controller together: only *refused* (forged-signature) deliveries spend the budget, the budget is scoped per /24 address block, and a rate-limit refusal writes no audit row. No database is involved because a delivery that names no intent applies nothing.

## Key elements

- **`CAP`** – Constant (`3`) set low enough to be exhausted in a handful of requests.
- **`loadWebhook()`** – Builds a minimal Express app wiring the real `webhookLimiter` (reloaded via `withReloadedRateLimits` with a custom cap) in front of the real `postPaymentWebhook` controller. Registers `fakePaymentProvider`, attaches the locale middleware, captures `rawBody` for signature verification, and returns `{ app, auditLogger }`.
- **`deliver(loaded, address, signed)`** – Sends a single `POST /payments/webhook/fake` request from a given `X-Forwarded-For` address, either with a valid signature or a forged one.
- **`inOneBlock(count)`** – Generates `count` distinct IPs inside `203.0.113.0/24`.
- **`statusesOf(loaded, addresses, signed)`** – Sends deliveries sequentially (order-sensitive) and returns the array of HTTP status codes.
- **`describe('the payment webhook budget')`** – Four test cases:
  1. Forgeries rotating addresses in one /24 hit 429 after the cap.
  2. Those refusals produce no `auditLogger.log` call.
  3. Signed deliveries from the same IP pass through indefinitely past the cap.
  4. A second /24 block retains its own independent budget.

## Relationships

- **`tests/support/rate-limit-harness.ts`** – `withReloadedRateLimits` re-imports `rate-limits.ts` with a custom `NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX` env value so the limiter reflects the low cap.
- **`src/modules/payments/rate-limits.ts`** – Source of `webhookLimiter`, the real limiter under test.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** – The real controller that handles the webhook and returns the 400/429/204 responses.
- **`src/modules/payments/providers/index.ts`** – Re-exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used to craft valid vs. forged signatures.
- **`src/modules/payments/providers/registry.ts`** – `registerPaymentProvider` installs the fake so the controller can resolve it.
- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider`, the no-op provider that makes the test database-free.
- **`src/infrastructure/http/middlewares/locale.ts`** – `attachLocale` middleware ensures the controller's translated refusal messages work (i18next dictionaries are booted in the original module registry).
- **`src/infrastructure/adapters/logger.ts`** – `auditLogger` is imported from the *reloaded* registry (the same instance the limiter's refusal path writes to) and spied on to assert no audit row is produced.

## Notes

- **Module-registry split is intentional.** The controller and i18n live on the *original* registry (where i18next is initialised); the audit logger is pulled from the *reloaded* registry because that is the copy the limiter's refusal code references. Mixing them up would either break `t()` or spy on the wrong logger instance.
- **`trust proxy` = 1** simulates a single reverse-proxy hop so that `X-Forwarded-For` populates `request.ip`, matching production. Without it the limiter would key on the supertest socket IP.
- **Sequential delivery matters.** `statusesOf` is deliberately serial; the rate-limit budget is order-sensitive and parallel requests would make the assertion flaky.
- **`afterAll(jest.resetModules)`** is required so that subsequent test files in the same worker start with a clean module cache after `withReloadedRateLimits` has swapped the registry.
