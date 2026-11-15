---
source: src/modules/payments/tests/unit/providers.test.ts
sha256: 85eccb869b8613e88ddb572a1f121cba7f3d3d78c477ec27e8a82a415faef271
generated_at: 2026-11-14T21:21:42.985554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment-provider port layer: the webhook signature sign/verify contract and the `resolvePaymentProvider` selector. It exists to pin down the security invariants (replay tolerance, secret-ring rotation, malformed-input rejection) and the "no silent fallback" rule for provider selection, without touching a database or any provider SDK.

## Key elements

- **`signedWith(secret, payload, timestamp?)`** – sets `NODE_PAYMENT_WEBHOOK_SECRET` and delegates to `signWebhookPayload`, producing a ready-to-verify header string.
- **`v1Of(header)`** – regex-extracts the first `v1=<hex>` token from a header for use in composite-header assertions.
- **`loadResolver()`** – resets the Jest module registry then re-imports `providers/index` to obtain a fresh `resolvePaymentProvider` closure that reflects the current env vars.
- **`describe('webhook signatures')`** – covers round-trip acceptance, tampered-body rejection, wrong-secret rejection, replay (outside 1-hour tolerance), malformed/undefined/short/over-long headers, the four-`v1` scan cap, and case-insensitive hex.
- **`describe('a ring of secrets…')`** – covers comma-separated secret rings: first-entry signing, per-entry verification, two-`v1` headers, position-independence of the matching `v1`, trim behaviour, and empty-`v1` rejection.
- **`describe('resolvePaymentProvider')`** – verifies that an unset env yields `undefined`, a registered name resolves, and an unregistered name **throws** rather than defaulting.

## Relationships

- **`src/modules/payments/providers/webhook-signature.ts`** – the module under test; exports `signWebhookPayload`, `verifyWebhookSignature`, and the `WebhookRejected` error class.
- **`src/modules/payments/providers/index.ts`** – exports `resolvePaymentProvider`; this file re-imports it per test (after clearing the module registry) so each call observes the latest environment variable.
- **`tests/support/environment.ts`** – provides `setEnvironment` / `resetEnvironment` to mutate `NODE_PAYMENT_WEBHOOK_SECRET` and `NODE_PAYMENT_PROVIDER` between assertions.

## Notes

- Tests that depend on a specific secret value call `setEnvironment` **before** signing and `resetEnvironment()` (or the next `setEnvironment`) afterwards; the `afterEach` in the `resolvePaymentProvider` block only resets the module registry, not the env — the secret block relies on sequential ordering.
- The over-length and four-`v1`-cap tests use a deliberately short secret (`'cap-test-secret'`) so the genuine header fits within the 200-char contract before padding is added.
- The "position-independence" test documents a past regression: an earlier `Map`-based implementation kept only the **last** `v1`, which a trailing forged token would have overridden.
- `resolvePaymentProvider` tests require a module-registry reset before re-import because the function reads env at import time; calling it twice without a reset would observe stale values.
