---
source: src/modules/webhooks/tests/unit/webhook-signing.test.ts
sha256: e640045b8ba1de981b5fcbd124df8c645f38b92298ddac083820b7496fa4286f
generated_at: 2026-09-23T19:45:30.727749+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/webhook-signing.test.ts

## Purpose

Unit tests for the webhook signing and verification path. The primary goal is interop conformance: one test asserts a byte-for-byte match against the published test vector from the [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) reference implementation. The remaining tests cover round-trip sign→verify, edge cases (Buffer vs. string body, missing/prefixed secret, tolerance windows), and multi-secret ring rotation.

## Key elements

- **`describe('signWebhookPayload — against the spec published test vector')`** — Three assertions: exact header values (`webhook-id`, `webhook-timestamp`, `webhook-signature`) match the spec vector; a secret without the `whsec_` prefix yields the identical signature; a `Buffer` body signs identically to the same UTF-8 string.
- **`describe('verifyWebhookSignatureForTest — round-tripping signWebhookPayload')`** — Six assertions covering: happy-path round-trip; rejection of a different raw body; rejection of a tampered signature; rejection of a missing `signatureHeader`; rejection of timestamps outside `toleranceSeconds` (both past and future); acceptance when a wider `toleranceSeconds` is supplied.
- **`describe('a secret ring rotation — two active secrets, one header')`** — Two assertions: signing with two secrets produces two space-separated `v1,…` entries, each independently verifiable by a consumer holding only one secret; verification fails once a secret is dropped from the ring.

## Relationships

- **`src/modules/webhooks/transport/webhook-signing.ts`** — Source of `signWebhookPayload`, the function under test. The test imports it via the `@modules/webhooks/transport/webhook-signing` alias.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** — Source of `verifyWebhookSignatureForTest`, a test-only wrapper around the real verification logic used for the round-trip and rejection assertions.

## Notes

- The spec vector (`msg_p5jXN8AQM9LWM0D4loKWxJek`, timestamp `1614265330`, body `{"test": 2432232314}`, secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`) is copied verbatim from the upstream repo. If the upstream vector changes, this test must be updated in lockstep.
- The `whsec_` prefix is stripped before base64-decoding the key; the second spec-vector test exists to lock in that both `whsec_…` and bare-base64 forms are accepted transparently.
- Ring-rotation signing produces a **space-separated** list of `v1,…` signature entries in a single `webhook-signature` header — this is the Standard Webhooks rotation mechanism, not a JSON array or comma list.
- Tolerance tests use `toleranceSeconds` as an explicit parameter to `verifyWebhookSignatureForTest`; the default (when omitted) is not exercised in this file.
