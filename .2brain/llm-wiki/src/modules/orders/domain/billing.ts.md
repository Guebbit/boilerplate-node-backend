---
source: src/modules/orders/domain/billing.ts
source_sha256: c40450d30cebed33bf39344bcfdf2b15080d0439c0810d4a7f7f3599d414eea6
context_sha256: e701fdf2e814d1bb63cdcdd9cc852f11bcfcff864fd78d759f10dca1064a3004
generated_at: 2026-11-22T06:10:53.244801+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/billing.ts

## Purpose
Domain rules for the billing-address correction (`PUT /orders/{id}/billing-address`): when staff may still make the correction, and when a request changes nothing and should therefore be a no-op. Pure functions, no I/O.

## Key elements
- `canCorrectBilling(order: { email: string }): boolean` — returns a result that is not true when the order's email equals `ANONYMIZED_EMAIL`, i.e. retention has already erased the order's personal data. Correcting then would re-write an address that was destroyed.
- `isSameBillingAddress(current, corrected): boolean` — field-by-field equality of `fullName`, `street`, `city`, `zip`, `country`, `phone` and `vatNumber`. `current` may be `undefined` (order with no address).

## Relationships
- `./anonymization` — supplies `ANONYMIZED_EMAIL`, the sentinel compared against in `canCorrectBilling`. The email is used because it is the one field the scrub always overwrites.
- `@types` (`src/types/index.ts`) — provides the `OrderBillingAddress` type used by `isSameBillingAddress`.
- Per the graph, `src/modules/orders/domain/index.ts`, `src/modules/orders/services/billing.ts` and `src/modules/orders/services/actions.ts` are neighbors. The file itself does not import them, so their exact usage isn't visible here. The service layer is the evident consumer of these rules.

## Notes
- `isSameBillingAddress` exists so an idempotent PUT (RFC 9110 §9.2.2) writes no row, announces no event and burns no invoice number.
- Comparison is strict (`===`) on every field, including optional `phone` and `vatNumber`. `undefined` and a present value are not equal.
- An order with no address never matches: `current?.fullName` is `undefined`, and `fullName` is required on `corrected`. Later fields are only reached when `current` is defined.
- `current` is expected to be decrypted.
- Further background: see `src/modules/orders/index.ts`.
