---
source: src/modules/payments/tests/deliver.ts
source_sha256: afdef007dca5f1aa9ec89ba3e5b266241882cbf41d24f13ddf45ae7ad3f1f127
context_sha256: 5bb551958f2e9eaa38bdc86c31a20da9a7a631b3d72ec4d2c00dcdecfbfe061c
generated_at: 2026-11-22T06:55:00.948322+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/deliver.ts

## Purpose
A test helper that delivers a provider event to the payments service the same way the webhook route does: the event is signed, then passed through `paymentService.receiveWebhook`. The unsigned apply step is not exposed on the service object, so tests that need an event applied use this "front door" instead.

## Key elements
- `deliver(event, providerName = 'fake')`: signs `event` with `signFakeDelivery`, then calls `paymentService.receiveWebhook(providerName, Buffer.from(body), headers)`. Returns `Promise<void>`. It resolves once the event is applied. It rejects as the route would: a refused signature, an event the schema refuses, or an unknown provider name.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: provides `signFakeDelivery`, which produces the `body` and `headers` for the signed delivery.
- `src/modules/payments/providers/index.ts`: provides the `ProviderWebhookEvent` type (type-only import) used for the `event` parameter.
- `src/modules/payments/services/index.ts`: provides `paymentService`, whose `receiveWebhook` is called.
- Integration tests under `src/modules/payments/tests/integration/` (`disputes`, `external-refunds`, `refund-cancel`, `refund-paid-outside`, `refund-provider-status`, `refund-reversal`, `refund-undeliverable`, `service`, `settlement-mismatch`) are neighbors in the dependency graph, which suggests they use this helper to inject provider events.

## Notes
- Signing uses the fake provider's helper regardless of `providerName`. Passing another name changes only the endpoint the delivery is addressed to.
- Because the call goes through the real webhook entry point, signature and schema validation apply to test events too.
