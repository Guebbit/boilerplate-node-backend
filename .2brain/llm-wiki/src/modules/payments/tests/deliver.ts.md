---
source: src/modules/payments/tests/deliver.ts
sha256: afdef007dca5f1aa9ec89ba3e5b266241882cbf41d24f13ddf45ae7ad3f1f127
generated_at: 2026-11-14T21:11:16.042524+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/deliver.ts

## Purpose

Test helper that delivers a provider webhook event to the payments service through the same signed-entrypoint a real provider would use. It exists so integration tests can apply events without duplicating the sign-then-dispatch sequence that the webhook route performs.

## Key elements

- **`deliver(event, providerName?)`** — Signs `event` via `signFakeDelivery`, buffers the body, and calls `paymentService.receiveWebhook`. Returns the same promise the route would resolve/reject with. Defaults `providerName` to `'fake'`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — Provides `signFakeDelivery`, the signing utility this file calls to produce a signed body and headers.
- **`src/modules/payments/providers/index.ts`** — Source of the `ProviderWebhookEvent` type that `deliver` accepts.
- **`src/modules/payments/services/index.ts`** — Source of the `paymentService` export; `deliver` delegates the final dispatch to it.
- **Integration tests** (`refund-cancel`, `refund-provider-status`, `refund-reversal`, `refund-undeliverable`, `disputes`, `external-refunds`, `service`, `settlement-mismatch`) — Import `deliver` to inject webhook events into the service under test.

## Notes

- The service object does not expose an unsigned "apply event" method on purpose; this helper enforces that tests exercise the same door (sign → dispatch) a real provider would, catching signature and schema validation issues.
- The file is a pure module (`@module` tag): importing it has no side effects beyond defining `deliver`.
- Rejection semantics mirror the route: a bad signature, a schema-rejected payload, or an unknown provider name all surface as promise rejections, so tests can assert on those paths naturally.
