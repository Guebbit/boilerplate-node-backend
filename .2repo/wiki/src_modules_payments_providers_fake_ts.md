# src/modules/payments/providers/fake.ts

## Purpose

A test/demo payment provider that never makes external calls. It mirrors the behavioral contract of a real PSP (charge → success or decline, refund → success) using a single hard-coded decline card number, so demos and e2e tests can exercise both the happy and decline paths without any network dependency.

## Key elements

- **`FAKE_DECLINE_CARD`** (`'4000000000000002'`) — the one card number that triggers a `declined` outcome; same digits Stripe uses in its test mode.
- **`fakePaymentProvider`** — an object conforming to the `PaymentProvider` interface:
  - `charge(charge, card)` — strips whitespace from the card number, compares it to `FAKE_DECLINE_CARD`; returns `'declined'` on match, `'succeeded'` otherwise. Logs the call (amount, currency, last-four, outcome).
  - `refund(charge)` — always resolves successfully. Logs the call.

## Relationships

- **`src/modules/payments/providers/index.ts`** — provides the `PaymentProvider` type that `fakePaymentProvider` implements.
- **`src/modules/payments/providers/card.ts`** — provides the `cardLastFour` helper used for safe, partial card-number logging.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` instance; every charge and refund call is logged so the fake leaves an observable trail (unlike a silent no-op).
- **`src/modules/payments/tests/unit/providers.test.ts`** — unit tests that exercise `fakePaymentProvider` directly.
- **`src/modules/payments/tests/integration/service.test.ts`** — integration tests that wire the fake into the payment service.
- **`src/modules/payments/tests/contract/api.contract.test.ts`** — contract tests that validate the API surface using the fake.

## Notes

- The card number is **never** logged in full; only the last four digits appear (via `cardLastFour`). This is a deliberate convention shared with the payment document layer.
- Any card number *except* `4000000000000002` succeeds, including Stripe's conventional `4242424242424242`. The decline path is intentionally one specific, documented number away.
- `charge` strips all whitespace before comparison, so card numbers entered with spaces (e.g. from a demo form) still match correctly.
- The log prefix `[fake-psp]` distinguishes its entries from real provider logs.
