---
source: src/modules/payments/providers/webhook-signature.ts
sha256: 7791a5b26362686d5101b6581584549ea0baecee3cba4d0fe4787abd952a1b16
generated_at: 2026-11-14T21:03:48.522282+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Shared HMAC-based webhook signature verification for all PSP providers. It defines the signing/verification discipline (HMAC-SHA256 over `<timestamp>.<raw body>` in a single header, constant-time comparison, replay window) in one place so that providers verify signatures while the demo and test suites can produce valid ones without each re-implementing the scheme.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** (`"payment-signature"`) — the canonical header name, lower-cased to match Node's incoming-header normalisation.
- **`TOLERANCE_SECONDS`** (300) — maximum clock skew before a delivery is rejected as stale, even with a valid signature.
- **`MAX_HEADER_LENGTH`** (200) / **`MAX_SIGNATURES`** (4) — hard caps on header size and the number of `v1` values parsed, bounding work a forger can trigger.
- **`WebhookRejected`** — error class with a `signatureFailure: boolean` flag. Distinguishes "the signature didn't verify" (treated as an attack) from other refusals (malformed body, missing event id) that the controller throws via a provider's own `parseWebhook`. The controller maps any `WebhookRejected` to a 400.
- **`secrets()`** — reads the signing ring from `paymentWebhookSecrets()` fresh on each call so a secret rotation requires no restart. Throws if the ring is empty (verifying against no secret would authenticate everyone).
- **`digest(timestamp, rawBody, secret)`** — single-secret HMAC-SHA256 hex digest of `"<ts>." + body`.
- **`signWebhookPayload(rawBody, timestamp?)`** — builds the full `t=…,v1=…` header value. Used by the demo fake and test suites to produce deliveries that pass verification.
- **`verifyWebhookSignature(rawBody, header)`** — the verification entry point. Checks header length, parses `t` and all `v1` values, enforces the tolerance window, then compares every provided signature against every secret in the ring using `constantTimeEqual`. Throws `WebhookRejected` on any failure.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — provides `constantTimeEqual`, the timing-safe byte comparison used in the final match loop.
- **`src/modules/payments/config.ts`** — source of `paymentWebhookSecrets`, the signing ring this module reads.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — the HTTP controller that calls `verifyWebhookSignature`, catches `WebhookRejected`, and responds 400 (never 500).
- **`src/modules/payments/providers/index.ts`** — barrel file; this module is one of the provider-level utilities it re-exports.
- **`scenarios/support/doubles/payments/fake.ts`** — the demo/test fake that calls `signWebhookPayload` to build deliveries that pass verification.
- **`src/modules/payments/services/settlement.ts`** — downstream consumer; the 300 s tolerance exists specifically because settlement's conditional writes stop a *second* settlement, not a *first* one arriving late.
- **`src/modules/payments/tests/unit/providers.test.ts`**, **`src/modules/payments/tests/integration/service.test.ts`**, **`src/modules/payments/tests/contract/api.contract.test.ts`**, **`tests/integration/security-events.test.ts`**, **`tests/integration/concurrency/payment-races.test.ts`**, **`tests/unit/scenarios/payments-fake.test.ts`**, **`tests/support/webhook-receiver.ts`** — all depend on `signWebhookPayload` to forge valid deliveries and on `WebhookRejected` to assert refusal semantics.
- **`src/infrastructure/config/fields.ts`** — defines the `Payment-Signature` header contract (`maxLength: 200`) that `MAX_HEADER_LENGTH` mirrors.

## Notes

- `secrets()` throws (not `WebhookRejected`) when the ring is empty — an unconfigured environment is a 500, not a 400. The controller is expected to treat this as a server error.
- The comparison loop computes one digest per secret *outside* the per-value inner loop; the body hash is the expensive part and is not repeated per provided signature.
- Provided signatures are lower-cased before comparison because `.digest('hex')` always emits lower-case hex, but a provider may send upper-case.
- All `v1` values (up to 4) are checked against **all** ring secrets with no short-circuit, so the timing profile doesn't reveal which secret matched.
- `WebhookRejected.signatureFailure` is set to `true` for every throw *in this file*; the controller uses it to decide whether to emit a security event. Throws originating in a provider's `parseWebhook` (malformed body, missing id) will have it as `false`.
