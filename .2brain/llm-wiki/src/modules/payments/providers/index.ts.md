---
source: src/modules/payments/providers/index.ts
sha256: d69b100ca969e71ae2b23c6dedef1c10e6e2be3679c7a08f2fb968f550a990f4
generated_at: 2026-09-27T15:24:54.424138+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/providers/index.ts

## Purpose

Defines the **payment provider port** — the interface every PSP implementation must satisfy — along with the provider registry and two resolution functions. It is the single seam where a real payment service plugs in: a live project adds one implementation file and one line to the `PROVIDERS` record, and no other call-site changes.

## Key elements

- **`PaymentProvider`** (interface) — the port. Methods: `prepare`, `confirm`, `retrieve`, `refund`, `cancel`, `parseWebhook`. Each carries idempotency, error, and security contracts in its JSDoc.
- **`ProviderPaymentStatus`** — union: `'requires_action' | 'processing' | 'succeeded' | 'declined'`. `refunded` is intentionally *absent*; it is this application's own later state.
- **`ProviderPaymentState`** — status + optional `cardLast4` (sourced from the provider; this server never sees full card digits).
- **`PreparedPayment`** — `providerRef` (persisted) + `clientSecret` (browser-only, never stored).
- **`ProviderWebhookEvent`** — normalised webhook payload with dedup `id`, optional `providerRef` and `state`.
- **`resolvePaymentProvider()`** — returns the implementation named by `NODE_PAYMENT_PROVIDER` (default `fake`). Read fresh per call; throws on unknown name rather than silently falling back.
- **`providerNamed(name)`** — resolves the implementation for a *specific payment's* `provider` field (e.g. routing a refund back to the PSP that took the money). Distinct from `resolvePaymentProvider`; the two must not be conflated.
- **Re-exports** — `PaymentInFlightError` (from `./errors`), `signWebhookPayload`, `verifyWebhookSignature`, `WEBHOOK_SIGNATURE_HEADER`, `WebhookRejected` (from `./webhook-signature`).
- **`PROVIDERS`** — private `Record<string, PaymentProvider | undefined>` registry; currently holds only `fake`.

## Relationships

- **`./fake`** — imports `fakePaymentProvider` into the registry; the default and test implementation.
- **`./errors`** — re-exports `PaymentInFlightError`, thrown by `cancel` when an intent is already succeeded or mid-flight.
- **`./webhook-signature`** — re-exports the HMAC signing/verification helpers and the `WebhookRejected` error type used by `parseWebhook` implementations.
- **`@infrastructure/runtime/environment`** — imports `environmentChoice` to read `NODE_PAYMENT_PROVIDER` with validation against registered keys.
- **Consumers (import from this file):** `services/intent.ts`, `services/refunds.ts`, `services/settlement.ts`, `services/offline.ts` call the provider methods; `controllers/post-payment-webhook.ts` calls `parseWebhook`; `module.ts` wires the resolved provider into the module graph. All three test files (`unit/providers.test.ts`, `contract/api.contract.test.ts`, `tests/integration/concurrency/payment-races.test.ts`) exercise the port's contracts.

## Notes

- **Two resolution paths, two questions.** `resolvePaymentProvider()` answers "which PSP opens *new* intents under the current deployment setting." `providerNamed()` answers "which PSP *actually took* the money on this specific payment row." A deployment that flips `NODE_PAYMENT_PROVIDER` must not silently redirect an old payment's refund to the new provider — that is the reason both exist.
- **`parseWebhook` takes a raw `Buffer`, not a parsed object.** Signatures are computed over exact bytes; re-serialising a JSON object changes them. The caller (`src/app/security.ts`) must preserve the original body.
- **`clientSecret` is never persisted, logged, or audited.** It authorises completing the payment challenge and is treated as a one-use credential.
- **`PROVIDERS[name]!`** uses a non-null assertion because `environmentChoice` guarantees the returned key is in `allowed` (which equals `Object.keys(PROVIDERS)`) or the fallback `'fake'` (also a key). The compiler cannot trace that guarantee across the call.
- **Refund idempotency is two-layered.** The provider-side `idempotencyKey` (e.g. `refund:{paymentId}`) makes concurrent retries safe at the PSP; the caller's own `succeeded → refunded` conditional write covers the sequential case. Both halves are required.
- **`cancel` is the counterpart to `prepare`** and exists because reference PSPs (e.g. Stripe PaymentIntents) do not auto-expire. It throws `PaymentInFlightError` if the intent already succeeded or is still processing — the correct remedy in that case is `refund`, not `cancel`.
