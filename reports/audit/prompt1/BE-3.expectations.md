# BE-3 — Cart rules & checkout — frozen expectations

Blind read of Tier A only:
- `src/modules/cart/openapi.yaml` (full file, focus on `CheckoutResponse` per batch instructions)
- `shared/contracts/openapi.root.yaml` (schemas/responses referenced by the cart fragment: `Order`,
  `OrderItem`, `OrderStatus`, `OrderActions`, `OrderAddress`, `CartItem`, envelopes, error responses)

No src/ file and no test file was opened before this commit.

## General cart endpoints

E1. `GET /cart` returns 200 with `CartResponseEnvelope` (`data` = `CartResponse`: `items[]` of
    `CartItem`, `summary`), 401 unauthenticated, 500 on error. No other status documented.
    (`src/modules/cart/openapi.yaml:7-23`)

E2. `POST /cart` (`upsertCartItem`) requires body `{ productId, quantity }`, `quantity` is an
    integer with `minimum: 1`. Success is 200 with the updated `CartResponseEnvelope`. 404 means a
    well-formed `productId` that matches no product; 422 covers a malformed request.
    (`src/modules/cart/openapi.yaml:24-48, 272-282`)

E3. `DELETE /cart` (`removeCartItemByBody`, alias of `removeCartItem`) requires body
    `{ productId }`. A missing/malformed `productId` answers 422 "before querying" (i.e. no lookup
    happens first); a well-formed id matching no cart line answers 404. It never falls back to
    clearing the whole cart on a stripped/malformed body — that is `DELETE /cart/all`'s job only.
    Success is 200 with the updated `CartResponseEnvelope`.
    (`src/modules/cart/openapi.yaml:49-75, 294-300`)

E4. `DELETE /cart/all` (`clearCart`) takes no request body ("bodyless on purpose") and empties the
    cart entirely. Success is 200 with `CartResponseEnvelope`. 401/500 only.
    (`src/modules/cart/openapi.yaml:77-93`)

E5. `PUT /cart/{productId}` (`updateCartItemById`, alias of `upsertCartItem`, "functionally
    equivalent to `POST /cart`") requires `quantity` (integer, minimum 1) in the body; `productId`
    comes from the path. Success 200 `CartResponseEnvelope`; 404 well-formed-but-unmatched id; 422
    validation error.
    (`src/modules/cart/openapi.yaml:95-123, 283-292`)

E6. `DELETE /cart/{productId}` (`removeCartItem`): 422 when `{productId}` "is not a usable
    ObjectId" (the controller answers before querying), 404 when well-formed but no matching cart
    line, else 200 `CartResponseEnvelope`.
    (`src/modules/cart/openapi.yaml:124-145`)

E7. `GET /cart/summary` returns 200 `CartSummaryResponseEnvelope` whose `data` (`CartSummaryResponse`)
    requires `itemsCount` (int ≥0, distinct line count), `totalQuantity` (int ≥0, sum of
    quantities), `total` (number ≥0, sum of price×quantity, "before tax/shipping/discounts");
    `currency` is optional (no `required` entry for it).
    (`src/modules/cart/openapi.yaml:147-163, 326-346`)

## Checkout (`POST /cart/checkout`) — primary focus, `CheckoutResponse`

E8. Request body is optional (`required: false`) and, when present, is `CheckoutRequest`:
    `email`, `notes` (string), `addressId` (Id), `shippingMethodId` (string) — none of these are
    listed as required, and the schema has `additionalProperties: false`.
    (`src/modules/cart/openapi.yaml:165-178, 302-324`)

E9. Success is **201** (not 200) with `CheckoutResponseEnvelope`, whose `data` is `CheckoutResponse`:
    `required: [order]`, `order` is a full `Order` object; `message` is an optional string.
    `additionalProperties: false` — nothing beyond `order`/`message` belongs in `data`.
    (`src/modules/cart/openapi.yaml:179-185, 258-270, 360-369`)

E10. "Converts the authenticated user's current cart into a new order. The cart is cleared upon
     success." — a successful checkout (201) leaves the cart empty and a new `Order` exists.
     (`src/modules/cart/openapi.yaml:169`)

E11. Checkout the returned `Order` must satisfy the shared `Order` schema's required set: `id,
     userId, email, items, totalItems, totalQuantity, totalPrice, status`. `items[]` are
     `OrderItem` (`product` = full `Product` snapshot + `quantity`, quantity ≥1).
     (`shared/contracts/openapi.root.yaml:581-654, 532-541`)

E12. `totalPrice` = "Sum of `product.price × quantity` across every line item, plus `shippingCost`
     when the checkout chose a method."
     (`shared/contracts/openapi.root.yaml:608-612`)

E13. If `addressId` is omitted, checkout uses the caller's default address when one exists; an
     `addressId` matching none of the caller's addresses refuses checkout with **404**
     (`errors[].code` = `CART_ADDRESS_NOT_FOUND`), not 422/409/etc.
     (`src/modules/cart/openapi.yaml:186-189, 311-316`)

E14. If `shippingMethodId` is omitted, the order carries no shipping (`shippingMethod`/
     `shippingCost` absent per `Order` schema). An id matching no method refuses checkout with
     **404**, `errors[].code` = `CART_SHIPPING_METHOD_NOT_FOUND`. Its cost is "priced against the
     lines being bought (free-above thresholds included) and frozen onto the order."
     (`src/modules/cart/openapi.yaml:317-324`)

E15. `shippingAddress` on the resulting `Order`, when present, is a **snapshot** (`OrderAddress`:
     fullName, street, city, zip, country required, phone optional) — it must not change later even
     if the address book entry is edited or deleted afterward, and it carries no `id`/`default`.
     (`shared/contracts/openapi.root.yaml:511-530`)

E16. Checking out an **empty cart** answers **409** (`Conflict`). The spec comment explicitly notes
     "the implementation has always answered 409; the spec simply never declared it" — so 409 for
     an empty-cart checkout is the documented/expected behavior even though it was a late addition
     to the contract file itself.
     (`src/modules/cart/openapi.yaml:190-192`)

E17. Other checkout error responses: 401 unauthenticated, 422 validation error (malformed request
     body), 500 internal error. No other status codes are documented for `POST /cart/checkout`.
     (`src/modules/cart/openapi.yaml:186-194`)

E18. Derived from E10 + E16 (both Tier A, combined): if two checkout requests race on the same
     cart, at most one may succeed (201, one `Order` created, cart cleared) — once cleared, any
     further concurrent/subsequent checkout attempt on that same now-empty cart must observe the
     empty-cart state and answer 409, not create a second order and not silently no-op with 201.
     There must never be two orders created from one cart's contents nor a "half" state where the
     cart is cleared but no order exists (or vice versa) — the spec describes checkout as a single
     conversion of cart → order, not two independently-failable steps.
     (`src/modules/cart/openapi.yaml:169, 190-192`)

## Reorder (`POST /cart/reorder/{orderId}`)

E19. Copies the lines of one of the caller's own past orders back into the cart; quantities from
     the order are **added on top of** what the cart already holds (not replacing existing lines).
     Each line is re-resolved against the catalogue "as it is today" (uses current product data,
     not the order's frozen snapshot); products since removed/deactivated/hidden are **skipped**.
     Returns the updated `CartResponseEnvelope` reflecting what actually landed. Admins are scoped
     to their own orders too.
     (`src/modules/cart/openapi.yaml:196-225`)

E20. 404 when `orderId` is well-formed but matches none of the caller's own orders. 409
     (`errors[].code` = `REORDER_UNAVAILABLE`) when every product on the order has left the public
     catalogue (nothing to add). 422 validation error. Success is **200**, not 201 (reorder returns
     a cart, not a new order).
     (`src/modules/cart/openapi.yaml:211-225`)

## Not stated by Tier A (flagged so a later "test agrees with spec" claim isn't invented)

N1. Tier A does not state initial `OrderStatus` value on checkout-created orders (the enum at
    `shared/contracts/openapi.root.yaml:543-548` just lists `pending, paid, processing, shipped,
    delivered, cancelled` as the closed set — it does not say checkout starts at `pending`). Any
    test asserting a specific initial status is corroborated by common sense but not by Tier A text
    alone.

N2. Tier A does not state locking/transaction mechanics (row locks, optimistic concurrency,
    idempotency keys) for checkout — only the outcome-level guarantees in E18 are derivable.
    Anything more specific a test asserts about *how* the race is prevented is SPEC-SILENT.

N3. Tier A does not state what `message` (optional field in `CheckoutResponse`) should contain.
