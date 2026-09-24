---
source: src/modules/payments/providers/webhook-signature.ts
sha256: b62c8fcab0225330cede50806c32a875147ffab27e0c5ea0fe00d2187255d4e6
generated_at: 2026-09-23T19:19:49.726803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Defines the shared HMAC-signature scheme for PSP webhooks: an HMAC-SHA256 over `<timestamp>.<raw body>` carried in a single header. It provides both the **sign** half (used by the demo provider and tests to produce valid deliveries) and the **verify** half (used by the controller to reject forgeries and replays). It lives in its own module so the signing side can be imported independently of the verification side and so a real PSP's native verifier can replace the verify half without touching the signing convention.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** (`'x-payment-signature'`) – the header name where the signature travels; lower-cased because Node normalises incoming header names.
- **`TOLERANCE_SECONDS`** (300) – max clock skew allowed; deliveries older than this are refused even with a valid signature (replay guard).
- **`WebhookRejected`** – error class for *any* reason a webhook is turned away (bad signature, unparseable body, missing event id). Answered HTTP 400 by the controller, never 500.
- **`signWebhookPayload(rawBody, timestamp?)`** – returns the `t=<ts>,v1=<hex>` header value. Accepts `Buffer` or `string`; defaults timestamp to current unix seconds. Used by the fake provider and by tests.
- **`verifyWebhookSignature(rawBody, header)`** – parses the header, checks staleness, then compares the recomputed HMAC to the provided value using `timingSafeEqual` (with a length pre-check to avoid `timingSafeEqual`'s throw-on-mismatch behaviour). Throws `WebhookRejected` on any failure.
- **`secret()`** (private) – reads `NODE_PAYMENT_WEBHOOK_SECRET` from the environment on every call so key rotation does not require a restart; throws if unset.

## Relationships

- **`src/modules/payments/controllers/post-payment-webhook.ts`** – the sole production caller of `verifyWebhookSignature`; catches `WebhookRejected` and responds 400, logging `error.message` as the headline.
- **`src/modules/payments/providers/fake.ts`** – the demo provider that calls `signWebhookPayload` to attach a valid signature to its outbound deliveries; also throws `WebhookRejected` for unparseable bodies or missing event ids.
- **`src/modules/payments/providers/index.ts`** – re-exports the public surface of this module so consumers can import from the barrel.
- **`src/modules/payments/tests/unit/providers.test.ts`** and **`src/modules/payments/tests/contract/api.contract.test.ts`** – exercise both `signWebhookPayload` and the end-to-end verify path through the controller.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** – provides canned headers/bodies for focused signature-verification tests.
- **`src/modules/webhooks/transport/webhook-signing.ts`** – the general-purpose webhook transport signing utility; this module is the payments-specific implementation of the same `t=…,v1=…` convention.

## Notes

- `verifyWebhookSignature` operates on the **raw bytes** of the request body. Passing a re-serialised JSON object will produce a different digest and always fail verification.
- The signature format is a Stripe-style `t=<unix-seconds>,v1=<hex>` pair, but the constant-time comparison and the 300-second replay window are this project's own additions on top of the format.
- `WebhookRejected` is deliberately named for the *broad* rejection case, not just bad signatures, so that the controller's logged `error.message` is accurate for the parse-error and missing-id cases thrown by `fake.ts`.
- The secret is read from `process.env` on every call (not cached at module load) specifically to support hot key rotation without a process restart.
