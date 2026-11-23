---
source: src/modules/payments/tests/integration/webhook-no-body.test.ts
source_sha256: c85d2a924e5b52ccfb10bca2864a95a53fbedde3dd53339047faaec07d9db275
context_sha256: f6167208efdf913138c1d1da20ff2b6ef66b2ac8d151019d8c4abd6ee0eaafdb
generated_at: 2026-11-22T07:04:10.474540+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/webhook-no-body.test.ts

## Purpose
Integration test verifying that a payment webhook POST with no body is treated as the caller's mistake: the response is 400 and nothing is logged at error level. The "parser ordering" error is kept only for the real invariant break, where a body was sent but no raw body reached the controller.

## Key elements
- `webhookApp(withRawBodyHook)`: builds a small Express app and returns it wrapped in `supertest`. When `withRawBodyHook` is true, it installs a JSON body parser with a `verify` hook that copies the buffer into `request.rawBody`. It then adds `attachLocale` and mounts `postPaymentWebhook` at `POST /payments/webhook/:provider`.
- `describe('POST /payments/webhook/:provider without a body')`: spies on the logger's `error` method (mocked to return the logger) in `beforeEach` and restores it in `afterEach`.
- Test cases:
  - A bare POST gives 400 and no error log.
  - A POST with only `Content-Type: application/json` gives 400 and no error log.
  - A POST with `Content-Type: text/plain` gives 400 and no error log. The JSON parser skips it, so `rawBody` stays unset. This is the only bodyless shape that reaches the controller that way. An empty JSON request keeps an empty buffer.
  - With the raw-body hook left out, a POST that sends JSON `{ id: 'evt_1' }` gives 400, and the logger's `error` method is called with an object whose `message` contains `parser ordering`.

## Relationships
- `src/modules/payments/controllers/post-payment-webhook.ts`: the controller under test, mounted directly on the test app.
- `src/infrastructure/http/middlewares/locale.ts`: `attachLocale` is applied as middleware before the route, as in the real app.
- `src/infrastructure/adapters/logger.ts`: the exported `logger` is spied on to assert whether error-level logging happens.

## Notes
- The app is deliberately built without the raw-body hook in the last case. The real app never does this, so the case simulates the parser-ordering invariant break.
- The `fake` provider segment in the URL is used in every request.
