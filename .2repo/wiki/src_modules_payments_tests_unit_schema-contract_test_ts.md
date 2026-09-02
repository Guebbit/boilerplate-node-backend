# src/modules/payments/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins down the `paymentSchema` declaration at the schema level—required fields, the unique index on `orderId`, reference targets, validation bounds, enum/default for `status`, and timestamps. It encodes the module's idempotence guarantee (one payment per order, enforced by the DB) as an executable assertion so that removing `unique: true` or loosening constraints fails CI rather than silently allowing double-charges.

## Key elements

- **`describe('paymentSchema')`** — single block containing six `it` cases:
  - *requires everything needed to say what was paid, for which order* — asserts `requiredPaths` equals `['amount', 'currency', 'orderId', 'provider']`; documents why `cardLast4`, `status`, and `userId` are intentionally absent from the required set.
  - *allows at most one payment per order, in the database* — asserts `indexOptionSpecs` includes `'orderId_1: unique=true'`.
  - *points at the order and the payer as real ObjectId references* — asserts `typeOf`/`refOf` for `orderId → Order` and `userId → User`.
  - *refuses a negative amount* — asserts `pathOptions('amount').min === 0`.
  - *restricts status to the contract enum and starts unconfirmed* — asserts the enum matches `Object.values(PaymentStatus)` and the default is `PaymentStatus.requires_confirmation`.
  - *keeps timestamps* — asserts `optionsOf(...).timestamps === true`.
- **Helpers from `@tests/schema`** — `requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `pathOptions`, `enumOf`, `defaultOf`, `optionsOf`. Each extracts a specific facet of the Mongoose schema for assertion without instantiating documents.

## Relationships

- **`src/modules/payments/model.ts`** — source of the `paymentSchema` under test; this file is its sole schema-level contract guard.
- **`src/types/index.ts`** — provides the `PaymentStatus` enum used to validate the schema's `status` enum and default.
- **`tests/support/schema.ts`** — provides the eight assertion helpers (`defaultOf`, `enumOf`, `indexOptionSpecs`, `optionsOf`, `pathOptions`, `refOf`, `requiredPaths`, `typeOf`) that this test relies on.

## Notes

- The file's module-level JSDoc is the authoritative explanation of *why* the unique index matters (idempotence under retries). Treat it as design rationale, not just documentation.
- `userId` being absent from `requiredPaths` is intentional (account-erasure unsets it); do not "fix" the test to include it.
- The test never instantiates a document or hits a DB; it inspects the Mongoose schema object directly, so it runs in pure unit-test speed.
- Convention: each `it` title is a prose assertion, and the inline comments explain the *business reason* behind the constraint rather than repeating the code.
