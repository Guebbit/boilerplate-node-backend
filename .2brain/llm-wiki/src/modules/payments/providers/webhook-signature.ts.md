---
source: src/modules/payments/providers/webhook-signature.ts
source_sha256: 063137febfe70cffd81ad1fd62fdf94acd3916cac8fd86283d7bab497218a73e
context_sha256: 7b9dfe1b82046958f1105ca79d72fbae5dffafc245fd2a0a1be9ba189fefc270
generated_at: 2026-11-22T06:47:56.356136+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose
Defines the shared signature scheme for PSP webhooks: an HMAC-SHA256 over `<timestamp>.<raw body>`, carried in one header, compared in constant time, and rejected if the timestamp is too old. It holds both halves (sign and verify) because providers verify while the demo and tests sign. A real provider's own verifier (e.g. `stripe.webhooks.constructEvent`) would replace the verify half, and this file remains the reference for what that verifier must do.

## Key elements
- `WEBHOOK_SIGNATURE_HEADER` — `'payment-signature'`, lower-case because Node normalises incoming header names.
- `WebhookRejected` — error for a delivery the app refuses to act on. It has a `signatureFailure` flag (default `false`) that separates a signature failure (an attack on the endpoint) from a provider's own malformed event. Its doc says it is answered 400, never 500, and that other code (a provider's `parseWebhook`) also throws it for unparseable bodies or events with no id.
- `signWebhookPayload(rawBody, timestamp?)` — returns `t=<ts>,v1=<hex>`, signed with the first secret in the ring. The timestamp defaults to now (unix seconds).
- `verifyWebhookSignature(rawBody, header)` — throws `WebhookRejected` (with `signatureFailure = true`) if the header is malformed, stale, or does not match. Otherwise it returns nothing.
- Internal helpers:
  - `secrets()` — loads the ring from `paymentWebhookSecrets()` and throws a plain `Error` if it is empty.
  - `digest()` — computes the hex HMAC for one secret.
  - Constants — `TOLERANCE_SECONDS = 300`, `MAX_HEADER_LENGTH = 200`, `MAX_SIGNATURES = 4`.

## Relationships
- Imports `constantTimeEqual` from `src/infrastructure/security/constant-time.ts` for the signature comparison.
- Imports `paymentWebhookSecrets` from `src/modules/payments/config.ts` to get the signing/verifying secret ring.
- The comments say providers call the verify half. The webhook controller (`src/modules/payments/controllers/post-payment-webhook.ts`) is referenced as the place that answers `WebhookRejected` with 400 and logs the error's message as the headline.
- The sign half is described as used by the demo's own deliveries and by tests exercising the webhook route. The listed test files and `tests/support/webhook-receiver.ts` sit in this neighbourhood.

## Notes
- Verification uses the raw bytes as received, never a re-serialised object.
- The header length is capped (200) before any split or HMAC, because a forger controls its size. The cap matches `maxLength` of `Payment-Signature` in the API contract.
- Secret rotation is supported:
  - Every `v1` value is considered, up to 4.
  - Every secret in the ring is tried.
  - Every pairing is compared with no short-circuit, so timing does not reveal which entry matched.
  - Only the first secret signs.
- The provided signatures are lower-cased before comparison, because the expected hex digest is always lower-case, so valid uppercase hex is accepted.
- The timestamp tolerance is ±300 s and uses an absolute difference. A valid signature is still refused when it is too old, because a captured body would otherwise stay valid forever, and the settlement's conditional writes only prevent a second settlement, not a late first one.
- The secret ring is read once per process (config store), so a rotation takes effect after a restart.
- A missing secret throws a plain `Error` (`NODE_PAYMENT_WEBHOOK_SECRET is not set`) instead of `WebhookRejected`. Verifying against an empty secret would authenticate every caller.
