# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment-provider layer that exercise pure logic with no database or network: the `cardLastFour` utility, the fake provider's charge/refund outcomes, and the environment-driven provider resolver. It lives at the unit level (not `tests/integration/`) precisely because none of these paths persist a document or hit Mongo.

## Key elements

- **`describe('cardLastFour')`** — verifies last-four extraction and that spaces are stripped before slicing.
- **`describe('fakePaymentProvider.charge')`** — asserts the fake PSP declines the documented magic number (`FAKE_DECLINE_CARD` / `4000 0000 0000 0002`), handles spaced input, and succeeds on any other card.
- **`describe('fakePaymentProvider.refund')`** — confirms `refund` always resolves to `undefined` (no failure path in the fake).
- **`loadResolver` (local helper)** — calls `jest.resetModules()` then dynamically imports `providers/index` so the module-level memoisation resets between tests.
- **`describe('resolvePaymentProvider')`** — checks the default (fake), an explicit `NODE_PAYMENT_PROVIDER` value, and that an unknown provider name throws with a descriptive message rather than silently falling back.

## Relationships

- **`src/modules/payments/providers/card.ts`** — static import of `cardLastFour`; tested directly.
- **`src/modules/payments/providers/fake.ts`** — static import of `fakePaymentProvider` and the `FAKE_DECLINE_CARD` constant; charge/refund behaviour is the primary subject of two `describe` blocks.
- **`src/modules/payments/providers/index.ts`** — dynamically imported inside `loadResolver` after `jest.resetModules()`; the exported `resolvePaymentProvider` is the target of the env-var / fallback tests.

## Notes

- `jest.resetModules()` is called in both `loadResolver` and the `afterEach` hook. The `afterEach` also restores or deletes `NODE_PAYMENT_PROVIDER` to prevent env leakage between tests.
- The decline card is tested in two forms (raw and space-separated) to mirror how a real form would submit it; this is an intentional guard, not a separate code path.
- The comment block at the top of the file explicitly documents *why* this test lives in `tests/unit/` rather than alongside `service.test.ts` in `tests/integration/`—useful context if the project's test layout is ever refactored.
