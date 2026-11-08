---
source: src/modules/payments/tests/unit/providers.test.ts
sha256: 9fa230d86844cb40b2e5fbb7fc432521d91ab038b1b56587842722bfe0877821
generated_at: 2026-11-08T07:40:16.709526+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for two things the payment-provider port exposes: the shared webhook-signature discipline (`sign` / `verify` / `WebhookRejected`) and the `resolvePaymentProvider` selection function. No database, no external mocks — the file exercises pure logic and env-var-driven configuration in isolation.

## Key elements

- **`signedWith(secret, payload, timestamp?)`** — helper that sets `NODE_PAYMENT_WEBHOOK_SECRET` via the test environment helper and returns the produced signature header.
- **`v1Of(header)`** — extracts the `v1=<hex>` fragment from a signature header (non-null-asserted regex).
- **`describe('webhook signatures')`** — verifies round-trip sign→verify, tampered-body rejection, wrong-secret rejection, replay-window rejection, malformed/short headers, and the **secret-ring rotation** sub-suite (first-entry signing, any-entry verification, multi-`v1` headers, position-independence of the genuine `v1`, whitespace trimming, empty-`v1` rejection).
- **`describe('…uppercase-hex…')`** — confirms the digest half of `v1=` is compared case-insensitively.
- **`loadResolver()`** — resets Jest's module registry, dynamically re-imports `providers/index`, and returns `resolvePaymentProvider` so each test sees a fresh module scope.
- **`describe('resolvePaymentProvider')`** — asserts: unset env → `undefined` (payments off); registered name → that provider; unregistered name → throws (no silent fallback).

## Relationships

- **`src/modules/payments/providers/webhook-signature.ts`** — the SUT for the first suite; imports `signWebhookPayload`, `verifyWebhookSignature`, and the `WebhookRejected` error class.
- **`src/modules/payments/providers/index.ts`** — the SUT for the second suite; `loadResolver()` re-imports it under a clean module cache to isolate the env-var read.
- **`tests/support/environment.ts`** — provides `setEnvironment` / `resetEnvironment` so tests can mutate and restore `NODE_PAYMENT_WEBHOOK_SECRET` and `NODE_PAYMENT_PROVIDER` without leaking state.

## Notes

- The resolver tests rely on `jest.resetModules()` + dynamic `import()`; any change to how `providers/index` reads its env var at import time (vs. call time) will break these tests.
- The "ring of secrets" convention: the **first** comma-separated entry is the signing key; **all** entries are candidates during verification. Entries are trimmed of surrounding whitespace.
- A comment in the multi-`v1` test references a prior bug where a `Map` kept only the **last** `v1`, causing a forged entry after the genuine one to reject the request. The current implementation must accept the genuine `v1` regardless of position.
- The file's JSDoc header explicitly notes that `service.test.ts` (which persists a payment document) lives under `tests/integration/`, and that the `fake` provider's outcome logic is tested in `tests/unit/scenarios/` — don't expect broader provider behaviour here.
