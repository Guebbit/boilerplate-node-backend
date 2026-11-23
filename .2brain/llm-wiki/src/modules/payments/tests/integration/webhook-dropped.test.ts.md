---
source: src/modules/payments/tests/integration/webhook-dropped.test.ts
source_sha256: 3e5ebf739bf9b2dfcf3d1f39cfaed2ebae6349d02598807134eaa012c382e696
context_sha256: 3f2aedc9bb64ceb347bbaa5ff941c594efd4cd6c11285b4e1bb6039f5256e51f
generated_at: 2026-11-22T07:03:59.205585+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/webhook-dropped.test.ts

## Purpose
Integration test for the `payment_webhook_dropped_total` metric. It checks that a correctly signed webhook delivery whose body the app cannot read (fails the event schema) is counted under the `unreadable` reason, and that a delivery with a bad signature is not counted, since bad signatures have their own alert.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `dropped()`: reads `paymentWebhookDroppedTotal` and returns the current value of the series with label `reason === 'unreadable'`, or `0` if absent.
- `deliver(body, signature)`: POSTs the raw body to `/payments/webhook/fake` with `Content-Type: application/json` and the signature header (`WEBHOOK_SIGNATURE_HEADER`).
- Test "counts a body that fails the event schema": sends a validly signed body where `providerRef` is an object (`{ $ne: null }`) instead of a valid value. It expects HTTP 400 and the counter to increase by exactly 1.
- Test "leaves a bad signature to its own alert": sends `'{}'` signed over a different payload. It expects HTTP 400 and the counter to be unchanged.

## Relationships
- `src/modules/payments/metrics.ts`: provides `paymentWebhookDroppedTotal`, the counter under test.
- `src/modules/payments/providers/index.ts`: provides `signWebhookPayload` (builds valid signatures) and `WEBHOOK_SIGNATURE_HEADER`.
- `src/modules/payments/providers/webhook-signature.ts`: related to signature handling. The test does not import it directly and reaches it through the providers index.
- `tests/support/http.ts`: provides `api()` (imported as `@tests/http`), the HTTP client used to hit the webhook endpoint.
- `tests/support/setup-test-db.ts`: provides `setupTestDb()` (imported as `@tests/setup-test-db`).

## Notes
- Each test compares the counter before and after rather than asserting an absolute value, so it does not depend on prior counter state.
- The `providerRef: { $ne: null }` payload looks like a NoSQL-operator-style injection shape. The file only says the body "fails the event schema" and does not state the intent.
- Both cases return 400, so the status code alone can't distinguish them. The metric is what separates the two paths.
