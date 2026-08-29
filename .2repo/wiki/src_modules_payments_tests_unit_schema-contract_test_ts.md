# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the **contract** of `paymentSchema`—its required fields, indexes, references, numeric bounds, enum, default, and timestamps. It exists so that any silent change to the schema (a dropped index, a new required field, a loosened constraint) is caught immediately, and so the file itself documents *why* each constraint matters.

## Key elements

- **`describe('paymentSchema')`** — single top-level block; every assertion is a `it` case.
- **Required-fields test** — asserts the exact set `['amount', 'currency', 'orderId', 'provider', 'userId']`; explicitly notes `cardLast4` and `status` are *not* required (provider may lack a card; status has a default).
- **Unique-index test** — asserts `indexOptionSpecs` includes `'orderId_1: unique=true'`; this is the module's sole idempotence guarantee.
- **Reference test** — asserts `orderId` → `ObjectId` / `Order` and `userId` → `ObjectId` / `User`.
- **Amount floor test** — asserts `pathOptions(paymentSchema, 'amount').min === 0`.
- **Status enum & default test** — asserts the enum equals `Object.values(PaymentStatus)` and the default is `PaymentStatus.requires_confirmation`.
- **Timestamps test** — asserts `optionsOf(paymentSchema).timestamps === true`.

## Relationships

- **`src/modules/payments/model.ts`** — source of the SUT; exports `paymentSchema`.
- **`src/types/index.ts`** — provides the `PaymentStatus` enum used to verify the status field's allowed values and default.
- **`tests/support/schema.ts`** — provides the eight introspection helpers (`defaultOf`, `enumOf`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `refOf`, `requiredPaths`, `typeOf`) that turn a Mongoose schema into inspectable data without instantiating it.

## Notes

- The `unique: true` index on `orderId` is called out (in the file's doc comment and the test) as the **only** thing preventing double-charging. Removing it produces no runtime error—orders simply get charged twice silently.
- `cardLast4` is deliberately *not* in the required set; the test documents why (not every provider exposes a card number). If a new provider *does* supply one, the schema should add it as optional.
- Assertions use the `@tests/schema` helpers rather than raw Mongoose internals, so the test stays readable and is decoupled from Mongoose version specifics.
