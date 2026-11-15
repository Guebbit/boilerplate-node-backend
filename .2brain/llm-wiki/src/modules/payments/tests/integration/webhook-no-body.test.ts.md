---
source: src/modules/payments/tests/integration/webhook-no-body.test.ts
sha256: 6e8f8424c18d9f1ec97de9a7a956fc12f0dea04bba6d8ea3738c3e30c825572a
generated_at: 2026-11-14T21:21:08.461335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/webhook-no-body.test.ts

## Purpose

Integration tests for the `POST /payments/webhook/:provider` endpoint covering the bodyless-request path. It verifies two distinct invariants: (1) a caller sending no body gets a 400 with **no** error-level log, and (2) the rare case where a body was sent but no raw body reached the controller (a parser-ordering break) gets a 400 **with** a specific error log.

## Key elements

- **`webhookApp(withRawBodyHook: boolean)`** – Factory that builds a minimal Express app (supertest agent). When the flag is `true` it registers `express.json` with a `verify` callback that stores `request.rawBody`, mirroring the real app. When `false`, the raw-body hook is deliberately omitted to simulate a parser-ordering invariant break.
- **`describe` block (4 cases)** – Exercises: bare POST (no body, no headers); `Content-Type: application/json` with no body; `Content-Type: text/plain` (JSON parser skips it, so `rawBody` is genuinely unset); and a body-sent-but-raw-body-missing scenario (hook omitted).
- **`errorLog` spy** – `jest.spyOn(logger, 'error')` set up in `beforeEach`, restored in `afterEach`, to assert presence or absence of error-level logging per case.

## Relationships

- **`src/modules/payments/controllers/post-payment-webhook.ts`** – The controller under test. Mounted at `/payments/webhook/:provider` in the test app; the tests assert its 400 responses and log calls.
- **`src/infrastructure/adapters/logger.ts`** – The imported `logger` is spied on (via its `error` method) to verify logging presence or absence for each scenario.
- **`src/infrastructure/http/middlewares/locale.ts`** – `attachLocale` is applied in the test app to match the real middleware chain, ensuring the controller's locale-dependent code paths are exercised.

## Notes

- The "parser ordering" test (`webhookApp(false)`) is the **only** case where the raw-body hook is absent. The real application always installs it; this test intentionally simulates an invariant break that should never occur in production.
- The `text/plain` case is singled out because it is the only bodyless shape that reaches the controller with `rawBody` unset. An empty `application/json` request still produces an empty buffer in `rawBody`, so it takes a different branch.
- All four tests expect HTTP 400; the discriminator is whether `logger.error` was called.
