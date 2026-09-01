# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the exact invariants of `paymentSchema`—required fields, the unique index on `orderId`, ObjectId references, validation bounds, enum/default values, and timestamps—so that the schema's shape is enforced by the test suite rather than by convention. It exists primarily to guard the `unique: true` constraint on `orderId`, which is the module's sole idempotence guarantee against double-charging.

## Key elements

- **`describe('paymentSchema')`** – top-level suite; no exported functions.
- **Required-fields assertion** – calls `requiredPaths(paymentSchema)` and expects exactly `amount`, `currency`, `orderId`, `provider`, `userId`. `status` is excluded (has a default); `cardLast4` is intentionally absent.
- **Unique-index assertion** – `indexOptionSpecs(paymentSchema)` must include `'orderId_1: unique=true'`.
- **Reference assertions** – `typeOf`/`refOf` verify `orderId → Order` and `userId → User` as `ObjectId` references.
- **Amount lower-bound assertion** – `pathOptions(paymentSchema, 'amount').min` must be `0`.
- **Status enum & default assertions** – `enumOf` equals `Object.values(PaymentStatus)`; `defaultOf` equals `PaymentStatus.requires_confirmation`.
- **Timestamps assertion** – `optionsOf(paymentSchema).timestamps` is `true`.

## Relationships

- **`src/modules/payments/model.ts`** – source of `paymentSchema`, the object under test.
- **`src/types/index.ts`** – source of the `PaymentStatus` enum used in the status assertions.
- **`tests/support/schema.ts`** – provides all introspection helpers (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `pathOptions`, `enumOf`, `defaultOf`, `optionsOf`) that inspect the Mongoose schema at runtime.

## Notes

- The module-level doc comment is the authoritative explanation of *why* the unique index matters: removing it produces no runtime error, it silently enables double-charging. Treat this test as the guard.
- `cardLast4` is deliberately not part of the schema (not every payment provider exposes a card number); do not add it as required.
- The default `status` (`requires_confirmation`) is a safety property: a freshly inserted payment has *not* taken money. Changing the default to a "paid" state would mark unpaid orders as settled at creation time.
- The negative-amount guard (`min: 0`) exists to force refunds through a dedicated, auditable path rather than through the payment-insertion path.
