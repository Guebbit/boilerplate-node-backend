---
source: src/modules/cart/services/checkout.ts
source_sha256: 2077fe9c7a09dc38324e58faf153bff8175a14eea68e0cb18766f1b629693927
context_sha256: 6d28b9c6d34c7f469854bc6a811e5e2712491b6a9739aa29eb22f321eda2c123
generated_at: 2026-11-22T04:35:28.194611+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/checkout.ts

## Purpose
Implements the cart checkout operation: turning a buyer's cart into an order. The module header calls it the one cart operation that writes to another module's collection (orders) and the one where a race can cost a customer money. This file resolves payment method, shipping and billing addresses in pre-flight steps that refuse the checkout before any stock moves or anything is written.

## Key elements
- `CheckoutChoices` (type): `Partial<CheckoutRequest>`. It holds the buyer's optional `addressId`, `billingAddressId`, `paymentMethod` (defaults to `card`), `notes` and `expectedTotal` (the total the buyer was shown, as decimal text with currency). A mismatch is refused with `CART_TOTAL_CHANGED`.
- `toOrderAddress(address)`: copies an address-book entry into an `OrderAddress` snapshot by iterating `POSTAL_ADDRESS_FIELDS`. The entry's `_id` and `default` flag cannot leak into the order, and absent optional fields such as phone stay absent.
- `PreflightOutcome<T>`: a result type, either `{ ok: true, ...T }` or `{ ok: false, reject }`.
- `resolvePaymentMethod(userId, paymentMethod = 'card')`: checks that the method is in `paymentService.listPaymentMethods()`. It then checks for a purchase hold (`userService.purchaseHoldOf`) and the open-unpaid-order cap (`orderService.openUnpaidOrderIds` against `maxOpenUnpaidOrdersPerAccount()`). All three refusals are 409s with `CART_*` codes.
- `resolveShipping(userId, addressId, shippingMethodId, basketShips)`: resolves the shipping method with `findShippingMethod` and the shipping address from the address book. Outcomes:
  - Unknown method: `shippingMethodNotFound()`.
  - Method without `requiresAddress` (pickup, digital): no address is resolved, and an explicit `addressId` is refused with 409 `CART_ADDRESS_NOT_APPLICABLE`.
  - Address not found: 404.
  - Country not in `shipToCountries()`: 422.
- `resolveBilling(userId, billingAddressId, shippingAddress)`: every order needs a billing address. It uses the named entry (404 if not the caller's). Otherwise it uses the shipping address ("same as shipping"), or the book's default entry when nothing ships to an address. It refuses with 422 `CART_BILLING_ADDRESS_REQUIRED` when none can be found.

The file imports `runCheckout`, which these helpers feed, and many other symbols. Its definition is not visible in the portion of the file shown here.

## Relationships
- `@infrastructure/http/response`: `generateReject`, `generateSuccess` and `fieldError` build the typed `ResponseReject` and `ResponseSuccess` results.
- `@infrastructure/http/errors`: `rejectDatabaseEnvelope` is imported for database failure handling.
- `@infrastructure/i18n` (`catalog.ts`, `context.ts`, `index.ts`): `t()` and `getDefaultLocale` supply the localized `cart.*` messages on rejects.
- `@domain-primitives/postal-address`: `POSTAL_ADDRESS_FIELDS` drives `toOrderAddress`.
- `@domain-primitives/money`: `fitsCurrency` and `toMinorUnits` are imported for money handling.
- `@modules/addresses` (`index`, `model`, `service`): the `addressService` and the `AddressItem` type back both address resolvers, which look up entries in the caller's address book.
- `../config`: `maxOpenUnpaidOrdersPerAccount()` and `cartLineMax` are imported; the first is the open-order cap.
- `../domain`: `evaluateCheckout`, `evaluateShippingRequirement` and `needsShipping` are imported. The shipping-requirement check is the later step that handles the shipping-required, shipping-cost and method-fit refusals.
- `../analytics` and `@infrastructure/observability/analytics`: `cartAnalyticsEvents`, `emitAnalyticsEvent` and `buildAnalyticsBase` are imported for analytics events.
- `@infrastructure/adapters/logger` appears as a graph neighbor, but no use of it is visible here.
- Other imports: `orders`, `inventory`, `users`, `payments`, `delivery` and `shop` modules, the cart `repository`, `./view`, `./preorder`, `./errors` and `@api/error-codes`.

## Notes
- Pre-flight steps run before any stock is held, so refusals leave no side effects.
- Payment methods are validated against the same list `GET /payments/methods` serves, so the two cannot disagree.
- A purchase hold blocks checkout only; paying an existing order is a separate path.
- An explicit `addressId` sent for a no-address shipment is refused with 409 rather than silently dropped.
- A physical basket with no shipping method gets no address here; `CART_SHIPPING_METHOD_REQUIRED` is raised later.
- With no default address on file, `resolveShipping` returns `address: undefined`. `evaluateShippingRequirement` later refuses this as `CART_ADDRESS_REQUIRED`.
