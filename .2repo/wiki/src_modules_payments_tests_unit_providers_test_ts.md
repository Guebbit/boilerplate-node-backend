# src/modules/payments/tests/unit/providers.test.ts

## Purpose

Unit tests for the payment-provider port: the `cardLastFour` utility, the fake PSP's charge/refund behavior, and the `resolvePaymentProvider` registry. These live here (rather than in `tests/integration/`) because none of the paths under test touch a database—only in-memory logic and provider selection.

## Key elements

- **`describe('cardLastFour')`** — verifies `cardLastFour` (from `card.ts`) returns the last four digits and strips spaces before slicing.
- **`describe('fakePaymentProvider.charge')`** — exercises `fakePaymentProvider.charge` (from `fake.ts`):
  - Declines the documented `FAKE_DECLINE_CARD` magic number.
  - Declines the same number with spaces (simulates raw form input).
  - Returns `'succeeded'` for any other card.
- **`describe('fakePaymentProvider.refund')`** — asserts `refund` resolves to `undefined` (no ledger to contradict it).
- **`loadResolver`** (local helper) — calls `jest.resetModules()` then dynamically imports `../../providers/index`, returning a fresh `resolvePaymentProvider` with its memoisation cleared.
- **`describe('resolvePaymentProvider')`** — checks the registry (from `index.ts`):
  - Defaults to the `fake` provider when `NODE_PAYMENT_PROVIDER` is unset.
  - Honours an explicit `NODE_PAYMENT_PROVIDER=fake` value.
  - Restores the original env var in `afterEach`.

## Relationships

- **`src/modules/payments/providers/card.ts`** — source of `cardLastFour`, the utility under test.
- **`src/modules/payments/providers/fake.ts`** — source of `fakePaymentProvider` and the `FAKE_DECLINE_CARD` constant; the primary SUT for charge/refund tests.
- **`src/modules/payments/providers/index.ts`** — source of `resolvePaymentProvider`; imported dynamically (not statically) so `jest.resetModules` can yield a clean module instance each test.

## Notes

- `resolvePaymentProvider` is imported via dynamic `import()` + `jest.resetModules()`, not a top-level static import, specifically to defeat its internal memoisation between tests.
- The `FAKE_DECLINE_CARD` value is a "documented magic number" (the test title calls it that); its actual value is whatever `fake.ts` exports, and the spaced variant `'4000 0000 0000 0002'` is used to confirm the provider normalises input the same way `cardLastFour` does.
- `refund` resolves to `undefined`, not a status string—assert with `.resolves.toBeUndefined()`.
- The env-var test saves/restores `process.env.NODE_PAYMENT_PROVIDER` manually; there is no `beforeAll`/`afterAll` pair—cleanup is in `afterEach`.
