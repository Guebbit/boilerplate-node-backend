---
source: src/modules/payments/providers/webhook-signature.ts
sha256: 1923ee5b47f8b570dcb912338dc6581b475b0208ee944d25bd0f406b5785f3c2
generated_at: 2026-09-27T15:25:09.801197+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Defines the shared HMAC-SHA256 signature scheme for PSP webhook deliveries: sign as `<timestamp>.<raw body>`, transmit in a single header, verify in constant time, and reject stale timestamps. It lives in its own file because the signing half is needed by the demo and test suites while the verifying half is needed by the controller, and because a real provider's own verifier (e.g. `stripe.webhooks.constructEvent`) replaces only the verify side.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** — exported constant `'x-payment-signature'`; the lower-cased header name used for both signing and verification.
- **`TOLERANCE_SECONDS`** (private, 300) — maximum age in seconds a delivery may be before rejection.
- **`WebhookRejected`** — exported `Error` subclass. Thrown for malformed headers, stale timestamps, and signature mismatches. Also thrown by `providers/fake.ts` for unparseable bodies or missing event IDs. The controller maps it to HTTP 400.
- **`secret()`** (private) — reads `NODE_PAYMENT_WEBHOOK_SECRET` on every call so a secret rotation requires no restart. Throws if the variable is unset (empty secret would authenticate every caller).
- **`digest(timestamp, rawBody)`** (private) — returns the lowercase hex HMAC-SHA256 of `${timestamp}.` + body bytes under the shared secret.
- **`signWebhookPayload(rawBody, timestamp?)`** — exported. Produces the full header value `t=<ts>,v1=<hex>`. Used by the demo and by tests to forge a verifiable delivery.
- **`verifyWebhookSignature(rawBody, header)`** — exported. Parses the header, checks timestamp freshness, recomputes the digest, and compares in constant time. Throws `WebhookRejected` on any failure.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — imports `constantTimeEqual` for the final signature comparison, avoiding a timing side-channel.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — the sole production caller of `verifyWebhookSignature`; catches `WebhookRejected` and responds 400.
- **`src/modules/payments/providers/fake.ts`** — also throws `WebhookRejected` (for unparseable bodies / missing event IDs), so the error class is shared across the provider layer.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** and **`src/modules/payments/tests/unit/providers.test.ts`** — call `signWebhookPayload` to construct valid deliveries and `verifyWebhookSignature` to assert the accept/reject boundary.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** — provides fixture signatures that exercise the same parse/compare path.

## Notes

- The signature header format is `t=<unix-seconds>,v1=<hex>`, parsed by splitting on commas then on the first `=`. This is a *Stripe-compatible* layout, not a bespoke one.
- `provided` is lower-cased before the constant-time compare because `.digest('hex')` always emits lowercase, but a real provider *may* send uppercase hex. Skipping the normalisation would reject valid deliveries.
- `rawBody` must be the exact received bytes (a `Buffer`). Re-serialising a parsed object changes whitespace/encoding and breaks the HMAC.
- The timestamp check uses `Math.abs(...)` so a slightly clock-skewed provider (a few seconds ahead) is tolerated in both directions within the 300 s window.
- `secret()` reads the env var on every invocation deliberately; caching it would silently pin the pre-rotation key.
