---
source: src/modules/payments/providers/webhook-signature.ts
sha256: 19984478b8721f6dcd3b1e69c22efdd484c20718bf6b0e07bc07c4f7f64166a5
generated_at: 2026-11-08T07:24:06.309095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/webhook-signature.ts

## Purpose

Implements the shared HMAC-SHA256 signature scheme for PSP webhook deliveries. It provides both the **verify** half (production: check an inbound header against the raw body) and the **sign** half (tests and demo: mint a valid header so a delivery can be exercised end-to-end). Lives in its own file because the two halves are consumed in different places and because a real provider's native verifier (e.g. `stripe.webhooks.constructEvent`) replaces the verify half while this file stays as the canonical reference for the required discipline.

## Key elements

- **`WEBHOOK_SIGNATURE_HEADER`** (`'payment-signature'`) — the lower-case header name where the signature travels.
- **`TOLERANCE_SECONDS`** (300) — internal constant; deliveries older than this are refused even with a valid signature (replay protection).
- **`WebhookRejected`** (exported class) — thrown for any delivery the app refuses to act on: bad signature, unparseable body, or missing event id. Carries a `signatureFailure` boolean so the controller can distinguish an attack on the endpoint from a provider's malformed event. Always answered 400, never 500.
- **`signWebhookPayload(rawBody, timestamp?)`** (exported) — produces a `t=…,v1=…` header value using the first secret in the ring. Used by the fake provider and test suites to build deliveries that pass verification.
- **`verifyWebhookSignature(rawBody, header)`** (exported) — parses the header, checks timestamp tolerance, then compares every `(v1, secret)` pairing via `constantTimeEqual`. Throws `WebhookRejected` on any failure.
- **`secrets()`** (internal) — reads `paymentWebhookSecrets()` fresh on each call so a rotation needs no restart; throws if the ring is empty.
- **`digest(timestamp, rawBody, secret)`** (internal) — computes the hex HMAC-SHA256 of `<timestamp>.<raw body>`.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — imports `constantTimeEqual`; all digest comparisons go through this to avoid leaking which ring entry matched via timing.
- **`src/modules/payments/config.ts`** — imports `paymentWebhookSecrets`; the source of the signing/verification ring.
- **`src/modules/payments/providers/index.ts`** — barrel for the providers directory; re-exports this module so consumers import from the directory.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — the HTTP controller that calls `verifyWebhookSignature`, catches `WebhookRejected`, and maps it to a 400 response. The `signatureFailure` flag on the error drives the controller's log headline.
- **`scenarios/support/doubles/payments/fake.ts`** — the fake PSP uses `signWebhookPayload` to mint valid signatures for outbound deliveries in scenarios.
- **`tests/support/webhook-receiver.ts`** — test harness that constructs and dispatches webhook requests, relying on `signWebhookPayload` to make them verify.
- **`src/modules/payments/tests/unit/providers.test.ts`** — unit tests covering the sign/verify round-trip, rejection paths, and edge cases of this module.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — contract-level tests that exercise the full webhook route (controller → verify → service) and assert the 400 / `WebhookRejected` behavior.
- **`tests/integration/security-events.test.ts`** — integration tests focused on rejection and attack scenarios (stale timestamps, bad signatures).
- **`tests/integration/concurrency/payment-races.test.ts`** — exercises settlement under concurrent webhook delivery; the tolerance window and idempotency interact with this path.

## Notes

- The signature format is `t=<unix-seconds>,v1=<hex>`. Multiple `v1` entries are permitted (and expected during a provider's secret rotation); **every** provided `v1` is checked against **every** secret in the ring before a match is accepted.
- The `v1` value from the header is lower-cased before comparison because `createHmac(…).digest('hex')` always emits lowercase hex, but a provider might send uppercase.
- `secrets()` reads config on every call (no caching) so that a runtime secret rotation takes effect immediately without a restart.
- An empty secret ring is a hard error (thrown), not a silent pass-through — verifying against zero secrets would authenticate every caller.
- `WebhookRejected.signatureFailure` defaults to `false`; the controller uses it to decide log severity/wording. This module always sets it `true`; the provider's own `parseWebhook` (outside this file) throws it with `false` for unparseable bodies or missing event ids.
- `rawBody` must be the exact bytes received on the wire — never a re-serialised object — or the HMAC will not match.
