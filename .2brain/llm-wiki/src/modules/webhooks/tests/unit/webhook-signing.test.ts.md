---
source: src/modules/webhooks/tests/unit/webhook-signing.test.ts
sha256: e640045b8ba1de981b5fcbd124df8c645f38b92298ddac083820b7496fa4286f
generated_at: 2026-11-08T09:10:50.508060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/webhook-signing.test.ts

## Purpose

Unit tests that validate `signWebhookPayload` against the **Standard Webhooks** specification's own reference test vector (copied verbatim from the upstream repo) and confirm that the test-fixture verifier (`verifyWebhookSignatureForTest`) round-trips correctly. A byte-for-byte match here asserts interoperability with any conforming consumer, not just internal consistency.

## Key elements

- **`describe('signWebhookPayload — against the spec published test vector')`** — three cases:
  - Reproduces the upstream reference implementation's exact `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers.
  - Confirms a secret *without* the `whsec_` prefix yields the identical signature (prefix is stripped, never part of the decoded key).
  - Confirms a `Buffer` body produces the same signature as the equivalent UTF-8 string body.

- **`describe('verifyWebhookSignatureForTest — round-tripping signWebhookPayload')`** — six cases:
  - Accepts a self-signed payload (happy path).
  - Rejects when the verification body differs from the signed bytes (verifies over raw body, not re-serialized JSON).
  - Rejects a tampered/garbage `webhook-signature` value.
  - Rejects when `signatureHeader` is `undefined`.
  - Rejects timestamps outside a 300 s tolerance window (both past and future).
  - Accepts the same timestamp when `toleranceSeconds` is widened to 3600.

- **`describe('a secret ring rotation — two active secrets, one header')`** — two cases:
  - With two secrets in the ring, `webhook-signature` contains two space-separated `v1,…` entries; a consumer holding *either* secret verifies successfully during the overlap.
  - Once the old secret is removed from the ring, a consumer holding only the old secret correctly fails.

## Relationships

- **`src/modules/webhooks/transport/webhook-signing.ts`** — provides `signWebhookPayload`, the sole unit under test. All signing assertions go through this function.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** — provides `verifyWebhookSignatureForTest`, a test-only verifier used to close the sign→verify loop without pulling in the full HTTP transport layer.

## Notes

- The spec vector (id, timestamp, body, secret, expected signature) is hard-coded and must stay in sync with the Standard Webhooks reference implementation. If upstream changes the algorithm or test vector, this test will fail.
- `verifyWebhookSignatureForTest` is a **test fixture**, not the production verifier; it exists so these tests stay in `tests/unit/` without importing transport-level dependencies.
- The `whsec_` prefix is metadata for operators; the signer strips it before base64-decoding. Tests with and without the prefix must always produce the same signature — a regression here indicates the prefix is (incorrectly) being fed into the HMAC input.
- Tolerance is asymmetric around "now": both `tooOld` and `tooNew` timestamps are rejected by default, but a wider `toleranceSeconds` overrides the window in both directions.
