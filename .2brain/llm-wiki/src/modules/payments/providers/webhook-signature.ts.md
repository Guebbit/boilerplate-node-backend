---
source: src/modules/payments/providers/webhook-signature.ts
sha256: 2042b62ec391f585010d40a7330977bdab963366843a4b9bef23282b9978c98b
generated_at: 2026-10-15T11:28:00.143857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Provides the shared HMAC-SHA256 signing and verification discipline for PSP webhook deliveries. The signature scheme is `HMAC-SHA256(secret, "<timestamp>.<raw body>")` transmitted as a single header and compared in constant time against a bounded timestamp window. The file exists as a standalone module so that the verify half (used by providers) and the sign half (used by the demo and tests) can be imported independently, and so that a real provider's own verifier (e.g. `stripe.webhooks.constructEvent`) can replace the verify half while this remains the reference contract.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** – Constant `'x-payment-signature'`; the (lower-case) header name where the signature travels.
- **`TOLERANCE_SECONDS`** – Internal constant (300 s); deliveries older than this are refused even with a valid signature.
- **`WebhookRejected`** – Exported `Error` subclass. Carries a `signatureFailure: boolean` flag so the controller can distinguish a rejected signature (potential attack) from a provider's own malformed/missing event. Thrown by `verifyWebhookSignature`; also thrown elsewhere (by `parseWebhook`) for unparseable bodies or events with no id.
- **`secrets()`** – Internal helper. Reads `paymentWebhookSecrets()` fresh on each call (supports rotation without restart). Throws if the ring is empty (fail-closed).
- **`digest(timestamp, rawBody, secret)`** – Internal helper. Returns the hex HMAC-SHA256 of `"<timestamp>." + rawBody` under one secret.
- **`signWebhookPayload(rawBody, timestamp?)`** – Exported. Produces the full header value `t=<ts>,v1=<hex>` using the first secret in the ring. Used by the demo and by tests to build deliveries that will verify.
- **`verifyWebhookSignature(rawBody, header)`** – Exported. Parses the `t=`/`v1=` pairs, enforces the timestamp tolerance, then compares every `(ring secret × provided v1)` pairing in constant time (lower-cased, no short-circuit). Throws `WebhookRejected` on any failure.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** – Supplies `constantTimeEqual`, the only comparison primitive used during verification.
- **`src/modules/payments/config.ts`** – Supplies `paymentWebhookSecrets()`, the secret ring consumed by both `signWebhookPayload` and `verifyWebhookSignature`.
- **`src/infrastructure/config/fields.ts`** – Defines the underlying config field (`NODE_PAYMENT_WEBHOOK_SECRET`) that `paymentWebhookSecrets()` reads.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** – The HTTP controller that calls `verifyWebhookSignature` on the raw body and header, and catches `WebhookRejected` to respond 400 (never 500). Uses the `signatureFailure` flag to shape the log headline.
- **`src/modules/payments/providers/index.ts`** – Barrel file that re-exports this module's public API alongside the concrete provider implementations.
- **`scenarios/support/doubles/payments/fake.ts`** – Test double that calls `signWebhookPayload` to produce valid signatures for fake deliveries.
- **`src/modules/payments/tests/unit/providers.test.ts`** – Unit tests that exercise `signWebhookPayload` and `verifyWebhookSignature` directly (malformed headers, stale timestamps, wrong secrets, rotation with multiple `v1` entries).
- **`src/modules/payments/tests/contract/api.contract.test.ts`** – Contract tests that sign payloads and assert the controller's 200/400 behaviour.
- **`tests/integration/security-events.test.ts`** – Integration tests verifying that rejected signatures are logged as security events and that valid ones are not.
- **`tests/integration/concurrency/payment-races.test.ts`** – Integration tests that sign concurrent deliveries to exercise the controller under race conditions.
- **`tests/unit/scenarios/payments-fake.test.ts`** – Unit tests for the fake provider's use of `signWebhookPayload`.

## Notes

- **Raw body, always.** `verifyWebhookSignature` expects the exact bytes received. Re-serialising a parsed object changes the digest and will always fail.
- **Multiple `v1` entries are expected, not exceptional.** A provider rotating its secret signs with both old and new keys and sends both values. The verifier checks *all* provided `v1` digests against *all* ring secrets; the first match is enough.
- **No short-circuit in the comparison loop.** Every `(secret, provided)` pairing is evaluated before the result is inspected, so the timing profile does not reveal which ring entry matched.
- **Case-insensitive hex.** The provided value is lower-cased before `constantTimeEqual`; `digest()` always emits lower-case hex. This prevents a valid uppercase delivery from being refused.
- **`WebhookRejected` is broader than this file.** The class is named for the general "refuse to act on this delivery" case; the `signatureFailure` flag is the only signal that *this* module (vs. the provider's `parseWebhook`) is the origin.
- **Fail-closed on empty secret.** `secrets()` throws rather than returning an empty array, because an empty ring would match every caller.
