# src/modules/payments/providers/fake.ts

## Purpose

A deterministic payment-provider stub that implements the `PaymentProvider` interface without any network calls. It mimics real PSP test-mode behavior (including Stripe's well-known decline card number) so that demos, e2e suites, and unit tests can exercise both the success and decline paths identically to production code.

## Key elements

- **`FAKE_DECLINE_CARD`** (`export const`) — The single card number (`4000000000000002`) that triggers a `declined` outcome. Mirrors Stripe's test-mode decline number.
- **`fakePaymentProvider`** (`export const`, type `PaymentProvider`) — The provider object with two methods:
  - `charge(charge, card)` — Strips whitespace from the card number; returns `'declined'` if it matches `FAKE_DECLINE_CARD`, otherwise `'succeeded'`. Logs the amount, currency, last-four, and outcome.
  - `refund(charge)` — Always resolves successfully (no external ledger to reject). Logs the amount and currency.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` to emit an `info` line on every `charge` and `refund` call.
- **`src/modules/payments/providers/card.ts`** — Imports the `cardLastFour` helper so that only the last four digits are written to the log.
- **`src/modules/payments/providers/index.ts`** — Imports the `PaymentProvider` type that `fakePaymentProvider` structurally satisfies.
- **`src/modules/payments/tests/contract/api.contract.test.ts`, `tests/integration/service.test.ts`, `tests/unit/providers.test.ts`** — Consume `fakePaymentProvider` (and likely `FAKE_DECLINE_CARD`) to drive both happy-path and decline-path assertions without a live PSP.

## Notes

- Card numbers are **never** logged in full; only `****` + last four is written. The doc comments call this out explicitly as a discipline the stub must uphold.
- `charge` and `refund` return already-resolved promises (`Promise.resolve(...)`), so there is no async gap to reason about in tests, but callers still `await` them per the interface contract.
- The `replaceAll(/\s/g, '')` normalisation means callers may pass human-formatted numbers (spaces, hyphens) and the decline check still works.
- Any card number *other* than the decline card succeeds — including blank or malformed strings. The stub does not validate; it only distinguishes the one magic number.
