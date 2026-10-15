---
source: src/modules/payments/tests/unit/providers.test.ts
sha256: 9fa230d86844cb40b2e5fbb7fc432521d91ab038b1b56587842722bfe0877821
generated_at: 2026-10-15T11:38:35.004388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment-provider port: the shared webhook-signature discipline (signing, verification, secret-ring rotation) and the `resolvePaymentProvider` registry lookup. It lives in `tests/unit/` because it touches no database or persistence; the provider's own outcome logic is covered separately in `tests/unit/scenarios/`.

## Key elements

- **`signedWith(secret, payload, timestamp?)`** – helper that sets `NODE_PAYMENT_WEBHOOK_SECRET` in the test environment and returns the result of `signWebhookPayload`.
- **`v1Of(header)`** – extracts the `v1=<hex>` fragment from a header string via regex.
- **`loadResolver()`** – calls `jest.resetModules()` then dynamically re-imports `../../providers/index` to obtain a fresh `resolvePaymentProvider` reference.
- **`describe('webhook signatures', …)`** – covers round-trip signing/verification, tampered body, wrong secret, replay (stale timestamp), malformed/undefined header, wrong-length hex, uppercase-hex acceptance.
- **`describe('a ring of secrets…', …)`** – covers multi-secret rotation: first-entry signing, verification against any ring member, multiple `v1` values, forged-entry placement, trimming of whitespace in comma-separated entries, and empty-`v1` rejection.
- **`describe('resolvePaymentProvider', …)`** – covers the no-provider case (returns `undefined`), explicit registered provider (`'fake'`), and refusal of an unregistered name (throws rather than silently falling back).

## Relationships

- **`src/modules/payments/providers/webhook-signature.ts`** – the module under test; imports `signWebhookPayload`, `verifyWebhookSignature`, and the `WebhookRejected` error class.
- **`src/modules/payments/providers/index.ts`** – imported dynamically (via `jest.resetModules()` + `await import`) to test `resolvePaymentProvider` in a clean module scope.
- **`tests/support/environment.ts`** – provides `setEnvironment` / `resetEnvironment` to mutate `NODE_PAYMENT_PROVIDER` and `NODE_PAYMENT_WEBHOOK_SECRET` between assertions without polluting the global process env.

## Notes

- Every `setEnvironment` call that sets a value should be paired with a `resetEnvironment()` (or overwritten by the next `setEnvironment`) before the test ends; the secret-ring tests interleave multiple set/verify cycles within a single `it`, so a missed reset can leak state into the next test.
- `loadResolver` relies on `jest.resetModules()` **before** the dynamic import; the `afterEach` also calls `jest.resetModules()` to prevent the cached module from leaking between tests.
- The uppercase-hex test only uppercases the `v1=` hex digest; the `t=` timestamp remains a plain decimal. Do not "fix" the regex to uppercase the whole header.
- The comment on the forged-`v1`-placement test references a historical bug (a `Map` kept the **last** `v1`); the current implementation must accept a genuine `v1` regardless of its position among forged entries.
