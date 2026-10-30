---
source: src/modules/payments/providers/webhook-signature.ts
sha256: 19984478b8721f6dcd3b1e69c22efdd484c20718bf6b0e07bc07c4f7f64166a5
generated_at: 2026-10-29T05:08:31.586890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Shared HMAC-SHA256 signing and verification for PSP webhook deliveries. The signature is over `<timestamp>.<raw body>`, compared in constant time, and rejected if the timestamp is outside a 5-minute window. This file exists because the **verify** side is called by production providers while the **sign** side is needed by the demo and the test harnesses, and because a real PSP's own verifier (e.g. `stripe.webhooks.constructEvent`) only replaces the verify half — this stays as the reference implementation for what it must do.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** (`'payment-signature'`) — the single header name where the signature travels; lower-case because Node normalises incoming header names.
- **`WebhookRejected`** — error class thrown for any delivery the application refuses (bad signature, malformed body, missing event id). Carries a `signatureFailure` boolean so the controller can distinguish an attack (→ alert) from a provider's malformed event (→ log only). The controller maps it to **400**, never 500.
- **`signWebhookPayload(rawBody, timestamp?)`** — produces the `t=<ts>,v1=<hex>` header value. Uses the **first** entry in the secret ring. Called by the demo and by test support code to forge a delivery that will pass verification.
- **`verifyWebhookSignature(rawBody, header)`** — parses the header, checks timestamp tolerance (±300 s), then compares the digest of **every** `(secret, provided-v1)` pairing in constant time. Throws `WebhookRejected` on any failure.
- **`secrets()`** (internal) — reads `paymentWebhookSecrets()` fresh on every call so a secret rotation takes effect without a restart; throws if the ring is empty.
- **`digest(timestamp, rawBody, secret)`** (internal) — `HMAC-SHA256` hex of `<ts>.` + raw body under a single secret.
- **`TOLERANCE_SECONDS`** (`300`) — replay window. A captured body is otherwise valid forever; the tolerance is what stops a late first settlement, not just a duplicate.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — provides `constantTimeEqual`, used to compare digests without leaking which ring entry matched.
- **`src/modules/payments/config.ts`** — provides `paymentWebhookSecrets`, the secret ring read at verification time.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — calls `verifyWebhookSignature` and catches `WebhookRejected` to return 400; uses the `signatureFailure` flag for logging/alerting.
- **`src/modules/payments/providers/index.ts`** — barrel for the providers package; re-exports this module alongside PSP-specific verifiers.
- **`scenarios/support/doubles/payments/fake.ts`** — uses `signWebhookPayload` to produce deliveries that pass verification in scenario tests.
- **`tests/support/webhook-receiver.ts`** — test harness that signs payloads via `signWebhookPayload` before dispatching to the route.
- **`src/modules/payments/tests/unit/providers.test.ts`**, **`src/modules/payments/tests/contract/api.contract.test.ts`**, **`src/modules/payments/tests/integration/service.test.ts`**, **`tests/integration/concurrency/payment-races.test.ts`**, **`tests/integration/security-events.test.ts`**, **`tests/unit/scenarios/payments-fake.test.ts`** — exercise the verify and/or sign paths through the controller or service layer.
- **`src/infrastructure/config/fields.ts`** — defines the config field backing `paymentWebhookSecrets`.
- **`src/modules/payments/services/settlement.ts`** — the downstream consumer whose conditional writes the timestamp tolerance is designed to protect (a late-but-signed first settlement is the threat, not a duplicate).

## Notes

- **Multiple `v1` entries are expected.** A provider rotating its secret signs with both old and new keys and sends two `v1` values. The verifier tries every `(ring-entry × provided-v1)` pairing; it does **not** pick the last `v1`.
- **Hex case is normalised before comparison.** `digest` always emits lower-case hex, but a provider may send upper-case. `value.toLowerCase()` is applied before the constant-time compare; skipping it would reject a valid delivery.
- **No short-circuit on match.** All pairings are evaluated and collected before `.includes(true)` is checked, so the response time does not reveal which secret in the ring was the match.
- **`rawBody` must be the exact received bytes.** Passing a re-serialised object (e.g. after JSON parse → stringify) will change the HMAC and cause a spurious rejection.
- **Empty ring is a hard error**, not a no-op. Verifying against zero secrets would authenticate every caller.
- The `signatureFailure` flag on `WebhookRejected` is `true` only when *this file* rejects the signature. The controller also catches `WebhookRejected` thrown by a provider's `parseWebhook` (malformed body / missing id) where the flag defaults to `false`.
