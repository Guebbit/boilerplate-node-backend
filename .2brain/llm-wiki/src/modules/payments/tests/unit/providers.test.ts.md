---
source: src/modules/payments/tests/unit/providers.test.ts
sha256: fdbddce38a7dd8db1d3e1d17c9e51b0a5cad651f4fdbceaf2221f4656961f016
generated_at: 2026-09-27T15:29:57.403926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment provider port's **fake** implementation, the shared webhook-signature utilities, and the provider resolver. Deliberately kept out of `tests/integration/` because none of these code paths touch Mongo; `service.test.ts` (which persists a payment document) lives there instead.

## Key elements

- **`fakePaymentProvider.prepare` block** — Verifies reference idempotency (same payment → same ref), uniqueness across payments, and that `clientSecret` ≠ `providerRef`.
- **`fakePaymentProvider.confirm` block** — Exercises every documented outcome path: decline, `requires_action` (challenge), `processing` (async settlement), success, and last-4-only card exposure.
- **`fakePaymentProvider.retrieve` block** — Confirms post-confirm state (e.g. `requires_action` → `succeeded`), that declined stays declined, and that an *unknown* reference resolves to `processing` rather than throwing.
- **`fakePaymentProvider.refund` / `.cancel` blocks** — Refund always resolves; cancel handles unconfirmed, double-cancel, post-decline, and (via `PaymentInFlightError`) post-success refusal.
- **`webhook signatures` block** — Round-trip sign/verify, tampered-body rejection, wrong-secret rejection, replay-window rejection, malformed/short-signature rejection, and case-insensitive hex acceptance.
- **`fakePaymentProvider.parseWebhook` block** — Accepts a valid signed event, rejects unsigned and missing-`id` deliveries with `WebhookRejected`.
- **`loadResolver` helper** — Calls `jest.resetModules()` then dynamically imports `providers/index` so each test sees a fresh module scope (env-var-dependent).
- **`resolvePaymentProvider` block** — Asserts default-to-fake, explicit `fake` selection, and that an *unknown* provider name throws rather than silently falling back.

## Relationships

| Neighbor | Interaction |
|---|---|
| `providers/fake.ts` | Source of `fakePaymentProvider`, `FAKE_DECLINE_METHOD`, `FAKE_SUCCESS_METHOD` — the primary system under test. |
| `providers/webhook-signature.ts` | Source of `signWebhookPayload`, `verifyWebhookSignature`, `WebhookRejected`; exercised directly and indirectly through `parseWebhook`. |
| `providers/index.ts` | Re-exports `PaymentInFlightError` (used as expected rejection) and provides `resolvePaymentProvider` (imported dynamically after `jest.resetModules()`). |
| `providers/errors.ts` | Defines `PaymentInFlightError`, surfaced here via the `providers/index` barrel. |

## Notes

- **Module-cache reset is load-bearing.** The `resolvePaymentProvider` suite depends on `jest.resetModules()` + a fresh dynamic import because the resolver reads `NODE_PAYMENT_PROVIDER` at call time from a cached module. Without the reset, the first test's env value leaks into later ones.
- **Env-var hygiene.** The webhook-secret test mutates `process.env.NODE_PAYMENT_WEBHOOK_SECRET` inline and restores it in the same `it`; the resolver test saves/restores `NODE_PAYMENT_PROVIDER` in `afterEach`. Adding a new env-dependent test without a matching restore will poison sibling tests.
- **Unknown-reference semantics.** `retrieve` on an unrecognised ref intentionally returns `processing` (the only status that moves no money in either direction). This is a contract for restarted/second-worker scenarios, not a fallback.
- **No mocks, no DB.** The file header explicitly states this is the boundary: anything that persists a payment document belongs in `tests/integration/`.
