---
source: src/modules/cart/services/checkout.ts
sha256: ebf301798cece06fee0b93f3aef376ea9df67b139e32d7f237554e408d182795
generated_at: 2026-09-27T14:45:56.596783+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

The cart module's sole write-to-another-module operation: it turns a basket into a placed order. It is the only cart service where a race can cost a customer money, so it front-loads all validation (payment method, shipping, stock) before any write, and sequences the order-write-before-cart-clear so a losing racer can retract rather than double-charge.

## Key elements

- **`toShippingAddress`** — Maps an `AddressItem` to the flat address snapshot embedded in an order document; explicitly excludes `_id`/`default`.
- **`PreflightOutcome<T>`** — Discriminated union (`ok: true` payload | `ok: false` + `ResponseReject`) returned by every pre-flight resolver.
- **`resolvePaymentMethod`** — Validates the chosen payment method against the deployment's live list; enforces the per-account open-bank-transfer cap. Returns 409 on both failures.
- **`resolveShipping`** — Resolves the shipping method id and (when required) the address before any stock moves. Refuses a stray `addressId` for a no-address (pickup) method with 409; checks `shipToCountries`.
- **`StockRefusal` / `buildStockRefusal`** — Normalises the two stock-related failure shapes (`insufficient-stock`, `unavailable`) into a single wire-format `ResponseReject`; status differs by caller (404 pre-flight vs 409 post-write).
- **`runCheckout`** — The checkout body: loads user, runs both pre-flight resolvers, reads cart lines (capturing `__v`), evaluates domain rules, calls `placeOrder`, then conditionally clears the cart. Split from the public entry point so the `.catch` envelope and analytics emit live in one place.
- **`orderConfirm`** *(implied public export)* — Wraps `runCheckout` with the `rejectDatabaseEnvelope` `.catch` and the analytics side-effects.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/http/response.ts` | Builds every success/reject payload via `generateSuccess` / `generateReject`. |
| `infrastructure/http/errors.ts` | Catches unexpected DB errors in `orderConfirm`'s `.catch` via `rejectDatabaseEnvelope`. |
| `infrastructure/i18n/*` | All user-facing error messages go through `t()`; `getDefaultLocale` seeds the buyer locale fallback. |
| `infrastructure/observability/analytics/index.ts` | `emitAnalyticsEvent` + `buildAnalyticsBase` fire on success and failure paths in the public entry point. |
| `modules/addresses/*` | `addressForCheckout` resolves the shipping address; `AddressItem` is the input type for `toShippingAddress`. |
| `modules/cart/analytics.ts` | Supplies the `cartAnalyticsEvents` event-name constants. |
| `modules/cart/domain/*` | `evaluateCheckout`, `basketWeight`, `needsShipping`, `evaluateShippingRequirement` and their types drive the post-join validation. |
| `modules/cart/repository.ts` | `cartRepository.findByUserId` reads the basket; `clearLinesIfUnchanged` performs the conditional write keyed on `__v`. |
| `modules/cart/services/view.ts` | `isJoined` and `readCartLines` prepare the joined line data `runCheckout` consumes. |
| `modules/cart/services/index.ts` | Re-exports the public checkout function for the route layer. |

## Notes

- **Concurrency contract:** Read cart → write order → clear cart is *not* a DB transaction. The cart clear uses `clearLinesIfUnchanged` (optimistic `__v` check) so exactly one of two racing checkouts succeeds; the loser must call `retractOrder` and return 409. The order is written *before* the cart is cleared so the loser has something to retract.
- **`paymentMethod` default:** The parameter uses `= 'card'` (not `?? 'card'`) so a caller explicitly passing `undefined` — the route's "none chosen" spelling — still gets the card default.
- **Stock refusal status split:** Pre-flight stock checks return **404** with per-line details; the `placeOrder`-side refusal returns **409** with no line detail. Both produce the same `CART_INSUFFICIENT_STOCK` / `CART_PRODUCT_UNAVAILABLE` codes so the client wording is identical.
- **Locale is resolved once** from the user document and reused for both the per-line snapshot and the confirmation email, preventing a mid-checkout locale mismatch.
- **Pickup + address conflict:** A method with `requiresAddress: false` that receives an explicit `addressId` is refused (409 `CART_ADDRESS_NOT_APPLICABLE`) rather than silently ignored.
