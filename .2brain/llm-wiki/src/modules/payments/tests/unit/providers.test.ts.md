---
source: src/modules/payments/tests/unit/providers.test.ts
sha256: 5bb260a628da953795084e375ba4d80fdc0fb5bf11387e39ccb887e52a918407
generated_at: 2026-09-23T19:24:29.201247+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment provider port's fake implementation, the shared webhook-signature utilities, and the provider resolver. They verify provider-selection logic, the fake PSP's state machine, and signature verification in isolation—no database, no external service—so they live here rather than in `tests/integration/`.

## Key elements

- **`describe('fakePaymentProvider.prepare')`** — Verifies idempotent `providerRef`/`clientSecret` derivation from metadata, uniqueness across payments, and that `clientSecret` ≠ `providerRef`.
- **`describe('fakePaymentProvider.confirm')`** — Covers each outcome branch: decline, `requires_action` (3-D Secure), `processing` (async settlement), `succeeded`, and that only the last-four digits leak.
- **`describe('fakePaymentProvider.retrieve')`** — Confirms that retrieval settles a confirmed intent to its final status, preserves terminal states (declined), and returns `processing` for unknown references (safe default for restarted processes / second workers).
- **`describe('fakePaymentProvider.refund')`** — Asserts the fake always resolves (no external ledger to disagree).
- **`describe('webhook signatures')`** — Round-trips `signWebhookPayload`/`verifyWebhookSignature`; rejects tampered bodies, wrong secrets, stale timestamps (1 h tolerance), malformed headers, and wrong-length hex digests—all throwing `WebhookRejected`.
- **`describe('fakePaymentProvider.parseWebhook')`** — Validates a signed delivery end-to-end; rejects unsigned deliveries and signed bodies missing an `id` field.
- **`describe('resolvePaymentProvider')`** (via `loadResolver` helper) — Uses `jest.resetModules()` + dynamic `import` to re-evaluate the registry in a fresh module scope. Asserts default-to-fake, explicit provider honouring, and that an unknown provider name **throws** rather than silently falling back to fake.

## Relationships

- **`src/modules/payments/providers/fake.ts`** — Primary test subject. Exports `fakePaymentProvider`, `FAKE_DECLINE_METHOD`, `FAKE_SUCCESS_METHOD`.
- **`src/modules/payments/providers/webhook-signature.ts`** — Exports `signWebhookPayload`, `verifyWebhookSignature`, `WebhookRejected`; exercised directly and indirectly through `parseWebhook`.
- **`src/modules/payments/providers/index.ts`** — Provides `resolvePaymentProvider`; imported dynamically after `jest.resetModules()` to test the selection logic in isolation.

## Notes

- The `resolvePaymentProvider` tests save/restore `process.env.NODE_PAYMENT_PROVIDER` and call `jest.resetModules()` in `afterEach`; the `NODE_PAYMENT_WEBHOOK_SECRET` test follows the same pattern. Missing cleanup can leak state into other test files in the same worker.
- The "unknown reference → `processing`" contract is intentional: it is the only status that moves no money in either direction, making it safe for cold-start or multi-worker scenarios.
- The resolver test for an unrecognised provider name (e.g. `'stripe'`) asserts a **throw**, not a silent fallback—the comment in the source flags that falling back to fake would mark orders paid without a real charge.
