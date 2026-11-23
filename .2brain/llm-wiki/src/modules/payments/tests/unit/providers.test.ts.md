---
source: src/modules/payments/tests/unit/providers.test.ts
source_sha256: 85eccb869b8613e88ddb572a1f121cba7f3d3d78c477ec27e8a82a415faef271
context_sha256: 21a63acbf727768759ebd0418328e422934b30f322495e76a4f2fdf61716cc8b
generated_at: 2026-11-22T07:05:42.894525+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose
Unit tests for the payment provider port: how a provider is selected via `NODE_PAYMENT_PROVIDER`, and the webhook signature discipline all providers share. It uses no mocks and no database. The persistence-dependent `service.test.ts` lives in `tests/integration/`, and the `fake` provider's outcome logic is tested separately in `tests/unit/scenarios/`.

## Key elements
- `signedWith(secret, payload, timestamp?)` — helper that sets `NODE_PAYMENT_WEBHOOK_SECRET` to `secret`, then returns `signWebhookPayload(payload, timestamp)`.
- `v1Of(header)` — helper that extracts the `v1=<hex>` part of a signature header.
- `describe('webhook signatures')` — covers `verifyWebhookSignature` and `signWebhookPayload`:
  - Accepts its own signature.
  - Rejects a tampered body, a different secret, a stale timestamp (a replay from an hour ago), a malformed or missing header, and a wrong-length signature. All of these throw `WebhookRejected`.
  - Rejects headers over 200 characters as `Malformed signature header`, before any hashing.
  - Reads only the first four `v1` values. A genuine one placed after four forged ones fails with `Signature does not match`.
  - Accepts uppercase-hex digests.
- Nested `describe('a ring of secrets…')` — covers key rotation, where the secret variable holds a comma-separated list:
  - Signing uses the first entry.
  - Verification accepts a signature from any entry.
  - A header with two `v1` values passes if either matching secret is in the ring.
  - The matching `v1` is accepted wherever it sits among forged ones.
  - A header where nothing matches is refused.
  - Entries are trimmed, so a space after a comma is not part of the secret.
  - An empty `v1=` is rejected as malformed.
- `loadResolver()` — calls `jest.resetModules()` and dynamically imports `providers/index`, so each test gets a fresh registry.
- `describe('resolvePaymentProvider')`:
  - Returns `undefined` when no provider is configured (card payments off).
  - Returns the provider named `fake` when `NODE_PAYMENT_PROVIDER=fake`.
  - Throws an error mentioning the name for an unregistered one such as `stripe`, instead of falling back.

## Relationships
- `src/modules/payments/providers/webhook-signature.ts` — supplies `signWebhookPayload`, `verifyWebhookSignature` and `WebhookRejected`, which the signature tests exercise.
- `src/modules/payments/providers/index.ts` — supplies `resolvePaymentProvider`, imported dynamically in each resolver test.
- `tests/support/environment.ts` — imported as `@tests/environment`. `setEnvironment` and `resetEnvironment` set and clear `NODE_PAYMENT_WEBHOOK_SECRET` and `NODE_PAYMENT_PROVIDER`.

## Notes
- The tests depend on environment variables being set per test. `resetEnvironment()` is called explicitly only in the "another secret" test, so the other tests rely on whatever reset the shared setup does.
- Resolver tests reset the module registry (`jest.resetModules()` in `afterEach` and in `loadResolver`), because the provider is read from the environment when the module is loaded.
- An unknown provider name is expected to throw. A comment explains why: a typo in the variable must not silently disable card payments or switch to another provider.
- A comment notes that a `Map` keeping only the last `v1` used to make a forged value placed after the genuine one cause a refusal. The tests now require acceptance in either order.
