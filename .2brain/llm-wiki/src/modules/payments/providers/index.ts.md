---
source: src/modules/payments/providers/index.ts
sha256: 5f19e2656c5c23fe1d21ac46f301c8a8c3b3a88c5be92948c2c771b9244c9a9f
generated_at: 2026-09-23T19:19:34.779739+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

Defines the `PaymentProvider` port — the contract every PSP implementation must satisfy — along with the supporting types that describe a payment's lifecycle state. It also provides the `resolvePaymentProvider` factory that selects an implementation at runtime based on `NODE_PAYMENT_PROVIDER`. The file exists so that swapping or adding a PSP is a one-file, one-registry-line change rather than a code-path refactor.

## Key elements

- **`PaymentProvider`** (interface) — the port. Methods: `prepare`, `confirm`, `retrieve`, `refund`, `parseWebhook`. A real implementation must verify webhook signatures over the raw body and never trust browser-reported status.
- **`ProviderPaymentStatus`** (type) — `'requires_action' | 'processing' | 'succeeded' | 'declined'`. Deliberately excludes `refunded` (that state is owned by this application, not the provider).
- **`ProviderPaymentState`** (interface) — status + optional `cardLast4` (the only card data this server may store).
- **`PreparedPayment`** (interface) — `providerRef` (persisted) + `clientSecret` (hand-off to browser; must never be persisted or logged).
- **`ProviderWebhookEvent`** (interface) — normalised webhook shape: `id` (dedup key), optional `providerRef`, optional `state`.
- **`resolvePaymentProvider()`** (exported const fn) — reads `NODE_PAYMENT_PROVIDER` fresh per call, validates against the `PROVIDERS` registry, returns the implementation or throws.
- **`PROVIDERS`** (module-private const) — registry mapping name → implementation. Currently only `fake`.
- **Re-exports from `./webhook-signature`** — `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, `WebhookRejected`.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — imports `environmentChoice` to validate the provider name against an allow-list and supply the `fake` default.
- **`src/modules/payments/providers/fake.ts`** — imports `fakePaymentProvider` and registers it as the only entry in `PROVIDERS`.
- **`src/modules/payments/providers/webhook-signature.ts`** — re-exports its public surface so downstream consumers import from this module rather than reaching into the sibling file.
- **`src/modules/payments/services/intent.ts`** — consumes `PaymentProvider` (calls `prepare`, `confirm`, `retrieve`) and `PreparedPayment`/`ProviderPaymentState` types.
- **`src/modules/payments/services/refunds.ts`** — consumes `PaymentProvider.refund`.
- **`src/modules/payments/services/settlement.ts`** — consumes `ProviderWebhookEvent` and `ProviderPaymentState` when processing webhook deliveries.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — calls `resolvePaymentProvider()` and `parseWebhook`, catches `WebhookRejected` to return 400.
- **`src/modules/payments/module.ts`** — wires the resolved provider into the service layer at bootstrap.
- **`src/modules/webhooks/services/publish.ts`** — receives processed `ProviderWebhookEvent` data for downstream domain event publication.
- **`src/modules/payments/tests/unit/providers.test.ts`** — unit-tests the registry resolution and type surface.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — asserts that implementations honour the `PaymentProvider` contract (idempotency, error semantics).

## Notes

- `clientSecret` is a live authorisation token; the codebase convention (enforced by the JSDoc) is that it is **never** persisted, logged, or audited.
- `parseWebhook` receives the raw `Buffer`, not a parsed object — signature verification is computed over the exact received bytes. `src/app/security.ts` is the only route that preserves the buffer.
- The `PROVIDERS[name]!` non-null assertion is safe by construction (`environmentChoice` only returns keys that exist in `PROVIDERS`), but the TypeScript compiler cannot verify that cross-call guarantee.
- `resolvePaymentProvider` intentionally does **not** memoise. A deployment typo that names an absent provider throws; it does **not** silently fall back to `fake`.
- Adding a real PSP means: (1) create one file exporting a `PaymentProvider`, (2) add one line to the `PROVIDERS` record, (3) set `NODE_PAYMENT_PROVIDER` in the environment. No other code changes.
