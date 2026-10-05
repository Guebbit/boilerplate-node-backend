/**
 * @module
 * Checkout — the one cart operation that writes to another module's collection, and the only one
 * where a race can cost a customer money.
 *
 * See: docs/modules/cart-checkout.md
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { maxOpenUnpaidOrdersPerAccount, shipToCountries, shopCurrency } from '@modules/orders';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import {
    orderService,
    orderTotal,
    toMinorUnits,
    placeOrder,
    sendOrderPlacedEmail,
    type OrderDocument
} from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { userService } from '@modules/users';
import { addressForCheckout, type AddressItem } from '@modules/addresses';
import { findShippingMethod, type StaticShippingMethod } from '@modules/delivery';
import { paymentService, type PaymentMethodInfo } from '@modules/payments';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { cartRepository } from '../repository';
import { cartLineMax } from '../config';
import {
    evaluateCheckout,
    evaluateShippingRequirement,
    needsShipping,
    type CheckoutShortfall,
    type UnavailableCartLine
} from '../domain';
import {
    effectiveShippingChoice,
    isJoined,
    readCartLines,
    shippingOptionsFor,
    shippingPriceFor,
    type JoinedCartLine
} from './view';
import { ERROR_CODES } from '@api/error-codes';

/**
 * The snapshot an order embeds, from a book entry — as its shipping or its billing address: the
 * address's fields, none of the book's. Spelled field by field so the entry's `_id`/`default`
 * cannot ride along into the order.
 */
const toOrderAddress = (address: AddressItem) => ({
    fullName: address.fullName,
    street: address.street,
    city: address.city,
    zip: address.zip,
    country: address.country,
    ...(address.phone === undefined ? {} : { phone: address.phone })
});

/**
 * What the buyer chose in the checkout request, every field optional.
 *
 * - `addressId`: the book entry to ship to; omitted means the default entry.
 * - `billingAddressId`: the book entry to invoice; omitted means "same as shipping", or the
 *   default entry when nothing ships to an address.
 * - `paymentMethod`: a method id from `GET /payments/methods`; omitted means `card`.
 * - `notes`: free text left for the order.
 * - `expectedTotal`: the total the buyer was shown, in minor units. A checkout that would charge
 *   another amount or currency is refused before anything is held (`CART_TOTAL_CHANGED`).
 */
export interface CheckoutChoices {
    addressId?: string;
    billingAddressId?: string;
    paymentMethod?: string;
    notes?: string;
    expectedTotal?: ExpectedTotal;
}

/** Either half of a pre-flight step: what {@link runCheckout} needs to proceed, or why not. */
type PreflightOutcome<T> = ({ ok: true } & T) | { ok: false; reject: ResponseReject };

/**
 * Which payment method this checkout uses, resolved before any stock moves: an unoffered method
 * refuses the checkout while nothing has been written yet. `GET /payments/methods`' own list is
 * asked rather than re-checked here, so the two can never disagree about what this deployment
 * offers.
 *
 * The open-order cap is checked here too, for EVERY method: each unpaid order holds stock, so this
 * is what stops one account hoarding the shelf across many uncompleted orders. The refusal names
 * the open orders, so the buyer can pay or cancel one.
 *
 * @param userId - the caller's id, for the open-order count
 * @param paymentMethod - the chosen payment method's id, or `undefined` for `card`
 */
const resolvePaymentMethod = async (
    userId: string,
    // Default, not `?? 'card'`: `paymentMethod` is this function's last parameter, so a caller
    // passing `undefined` (the checkout route's own "none chosen" spelling) gets 'card' for free.
    paymentMethod = 'card'
): Promise<PreflightOutcome<{ requestedMethod: string; methodInfo: PaymentMethodInfo }>> => {
    const methodInfo = paymentService
        .listPaymentMethods()
        .find((method) => method.id === paymentMethod);
    if (!methodInfo)
        return {
            ok: false,
            reject: generateReject(409, [
                {
                    code: ERROR_CODES.CART_PAYMENT_METHOD_NOT_AVAILABLE,
                    message: t('cart.payment-method-not-available')
                }
            ])
        };

    const openOrderIds = await orderService.openUnpaidOrderIds(userId);
    if (openOrderIds.length >= maxOpenUnpaidOrdersPerAccount())
        return {
            ok: false,
            reject: generateReject(409, [
                {
                    code: ERROR_CODES.CART_OPEN_ORDER_LIMIT,
                    message: t('cart.open-order-limit'),
                    details: { orderIds: openOrderIds }
                }
            ])
        };

    return { ok: true, requestedMethod: paymentMethod, methodInfo };
};

/**
 * Which method and address this checkout ships to, resolved before any stock moves: a named
 * method or address entry that does not resolve refuses the checkout while nothing has been
 * written yet. This only resolves WHICH method and address — whether the basket needs them,
 * shipping cost and whether the method fits are {@link evaluateShippingRequirement}'s call, made
 * later once the joined lines are known.
 *
 * Nothing ships to an address: an all-digital basket, or a method whose `requiresAddress` is
 *          false (pickup). No shipping address is resolved at all — not even the caller's
 *          default — so the order never freezes one nobody ships to (billing has its own,
 *          {@link resolveBilling}).
 * Refused: an explicit `addressId` sent anyway is refused (409), not quietly dropped — a value
 *          that cannot apply here is a state conflict, the same status
 *          `CART_SHIPPING_NOT_APPLICABLE` already answers for a method named for an all-digital
 *          basket.
 *
 * @param userId - the caller's id, whose address book `addressId` is looked up against
 * @param addressId - the shipping address's entry id, or `undefined` for the default/no address
 * @param shippingMethodId - the cart's chosen shipping method id (`PUT /cart/shipping-method`),
 * or `undefined` for none
 * @param basketShips - whether any line of the basket needs shipping
 */
const resolveShipping = async (
    userId: string,
    addressId: string | undefined,
    shippingMethodId: string | undefined,
    basketShips: boolean
): Promise<
    PreflightOutcome<{
        shippingMethod: StaticShippingMethod | undefined;
        address: AddressItem | undefined;
    }>
> => {
    const shippingMethod =
        shippingMethodId === undefined ? undefined : findShippingMethod(shippingMethodId);
    if (shippingMethodId !== undefined && !shippingMethod)
        return {
            ok: false,
            reject: generateReject(404, [
                {
                    code: ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND,
                    message: t('cart.shipping-method-not-found')
                }
            ])
        };

    // A physical basket with no method is refused later as `CART_SHIPPING_METHOD_REQUIRED`;
    // until then there is simply no address to resolve.
    if (!shippingMethod && basketShips) return { ok: true, shippingMethod, address: undefined };

    if (!shippingMethod?.requiresAddress) {
        if (addressId !== undefined)
            return {
                ok: false,
                reject: generateReject(409, [
                    {
                        code: ERROR_CODES.CART_ADDRESS_NOT_APPLICABLE,
                        message: t('cart.address-not-applicable')
                    }
                ])
            };
        return { ok: true, shippingMethod, address: undefined };
    }

    const address = await addressForCheckout(userId, addressId);
    if (address === null)
        return {
            ok: false,
            reject: generateReject(404, [
                {
                    code: ERROR_CODES.CART_ADDRESS_NOT_FOUND,
                    message: t('cart.address-not-found')
                }
            ])
        };

    // No default address on file leaves `address` `undefined` here;
    // `evaluateShippingRequirement` further down is what refuses THAT case
    // (`CART_ADDRESS_REQUIRED`).
    if (address && !shipToCountries().includes(address.country))
        return {
            ok: false,
            reject: generateReject(422, [
                {
                    code: ERROR_CODES.CART_SHIP_TO_COUNTRY_NOT_SUPPORTED,
                    message: t('cart.ship-to-country-not-supported')
                }
            ])
        };

    return { ok: true, shippingMethod, address };
};

/**
 * Which address the order is invoiced to — every checkout order carries one (the invoice prints
 * it as the buyer's, EU VAT Directive Art. 226), so this refuses when none can be found.
 *
 * Named:   the book entry `billingAddressId` points at (404 when it is not the caller's).
 * Same:    none named and a shipping address resolved — "same as shipping", the default choice.
 * Default: none named and nothing ships to an address — the book's default entry.
 * Refused: none of those — 422 `CART_BILLING_ADDRESS_REQUIRED`.
 *
 * @param userId - the caller's id, whose address book `billingAddressId` is looked up against
 * @param billingAddressId - the billing entry's id, or `undefined` for "same as shipping"/default
 * @param shippingAddress - the resolved shipping address, or `undefined` when nothing ships to one
 */
const resolveBilling = async (
    userId: string,
    billingAddressId: string | undefined,
    shippingAddress: AddressItem | undefined
): Promise<PreflightOutcome<{ billingAddress: AddressItem }>> => {
    if (billingAddressId === undefined && shippingAddress)
        return { ok: true, billingAddress: shippingAddress };

    const billingAddress = await addressForCheckout(userId, billingAddressId);
    if (billingAddress === null)
        return {
            ok: false,
            reject: generateReject(404, [
                {
                    code: ERROR_CODES.CART_ADDRESS_NOT_FOUND,
                    message: t('cart.address-not-found')
                }
            ])
        };
    if (billingAddress === undefined)
        return {
            ok: false,
            reject: generateReject(422, [
                {
                    code: ERROR_CODES.CART_BILLING_ADDRESS_REQUIRED,
                    message: t('cart.billing-address-required')
                }
            ])
        };
    return { ok: true, billingAddress };
};

/**
 * The refusal for a shortfall in what the basket can actually buy — one shape whether
 * `evaluateCheckout`'s pre-flight verdict caught it or `placeOrder`'s write did, so a customer
 * sees identical wording regardless of which check refused.
 *
 * `unavailable`'s status differs by caller: 404 pre-flight, since nothing has been written yet
 * and `lines` names every offending line; 409 once `placeOrder` has already run and refused for a
 * reason other than stock, with no lines to name — both existing behaviours, preserved as-is.
 */
type StockRefusal =
    | { type: 'insufficient-stock'; shortfalls: readonly CheckoutShortfall[] }
    | { type: 'unavailable'; status: 404 | 409; lines?: readonly UnavailableCartLine[] };

/** Builds the wire-level reject for a {@link StockRefusal}. */
const buildStockRefusal = (refusal: StockRefusal): ResponseReject => {
    if (refusal.type === 'insufficient-stock')
        return generateReject(409, [
            {
                code: ERROR_CODES.CART_INSUFFICIENT_STOCK,
                message: t('cart.insufficient-stock'),
                // Every short line, so the customer fixes the basket in one pass instead of one
                // refusal per line. Copied field by field: the reserve's own shortfall also carries
                // the exact count left, which a shopper is not told.
                details: {
                    lines: refusal.shortfalls.map(({ productId, title, requested }) => ({
                        productId,
                        title,
                        requested
                    }))
                }
            }
        ]);
    return generateReject(refusal.status, [
        {
            code: ERROR_CODES.CART_PRODUCT_UNAVAILABLE,
            message: t('cart.product-unavailable'),
            // Absent for the placeOrder-side refusal: only the pre-flight verdict has per-line
            // detail to report.
            ...(refusal.lines ? { details: { lines: refusal.lines } } : {})
        }
    ]);
};

/** An order total in minor units, as the contract's `ExpectedTotal` spells it. */
interface ExpectedTotal {
    /** Minor units of `currency` (EUR 71.00 is 7100). */
    amount: number;
    /** The ISO-4217 code the amount is priced in. */
    currency: string;
}

/**
 * What this basket would cost right now, in minor units: the items plus the chosen shipping, priced
 * exactly as `GET /cart`'s summary and the order itself price them, so the three cannot disagree.
 */
const totalNow = (
    joined: JoinedCartLine[],
    shippingMethod: StaticShippingMethod | undefined
): ExpectedTotal => {
    const currency = shopCurrency();
    const shippingCost = shippingMethod ? shippingPriceFor(shippingMethod, joined, currency) : 0;
    return {
        amount: toMinorUnits(orderTotal({ items: joined, shippingCost, currency }), currency),
        currency
    };
};

/**
 * Refuse a checkout whose total is not the one the buyer was shown (409 `CART_TOTAL_CHANGED`),
 * answering with both totals so the screen can show the new one. Nothing is written yet, so
 * nothing needs undoing. A request without `expectedTotal` is not refused here: the HTTP contract
 * requires the field, and a direct service caller that names none has shown nobody anything.
 *
 * @param joined - the basket's lines, product joined
 * @param shippingMethod - the resolved method, or `undefined` when nothing ships
 * @param expectedTotal - what the buyer was shown
 * @returns the refusal, or `undefined` when the totals match
 */
const refuseChangedTotal = (
    joined: JoinedCartLine[],
    shippingMethod: StaticShippingMethod | undefined,
    expectedTotal: ExpectedTotal | undefined
): ResponseReject | undefined => {
    if (!expectedTotal) return undefined;
    const actual = totalNow(joined, shippingMethod);
    if (actual.amount === expectedTotal.amount && actual.currency === expectedTotal.currency)
        return undefined;
    return generateReject(409, [
        {
            code: ERROR_CODES.CART_TOTAL_CHANGED,
            message: t('cart.total-changed'),
            details: { expected: expectedTotal, actual }
        }
    ]);
};

/**
 * The checkout body proper, split out of {@link orderConfirm} for its `.catch` envelope and
 * observability side effects. `async`/`await`, not chained: every step depends on the value
 * the previous one resolved, and any throw here still rejects through the caller's `.catch`.
 *
 * CONCURRENCY. Read cart → write order → empty cart is three statements; nothing ties the third
 * to the first unless the cart write is conditional on the `__v` it was read at — exactly one of
 * two racing checkouts wins that write. The order is written (and stock held) before the cart is
 * cleared, so the loser deletes its own order and answers 409 rather than double-charging —
 * a briefly-created order is recoverable, a cart emptied with no order is not. `../repository`'s
 * `clearLinesIfUnchanged` documents why this is a conditional write, not a transaction.
 *
 * @param userId - the caller's id
 * @param choices - what the buyer chose in the request body; see {@link CheckoutChoices}
 */
const runCheckout = async (
    userId: string,
    { addressId, billingAddressId, paymentMethod, notes, expectedTotal }: CheckoutChoices
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const user = await userService.getById(userId);
    if (!user) return generateReject(404, []);

    // The whole language chain for this checkout — both the snapshot each line freezes and,
    // further down, the confirmation email — decided once so the two cannot disagree.
    const buyerLocale = user.locale ?? getDefaultLocale();

    // Both pre-flight steps run before anything is written — an unoffered payment method, an
    // unpaid-order cap, an unmatched shipping method or an address that isn't the
    // caller's all refuse the checkout while nothing has moved yet.
    const paymentResolution = await resolvePaymentMethod(userId, paymentMethod);
    if (!paymentResolution.ok) return paymentResolution.reject;
    const { requestedMethod, methodInfo } = paymentResolution;

    const cart = await cartRepository.findByUserId(userId);
    // The version the lines below are read at, and the condition the cart is emptied
    // under. Captured before the join, so anything that touches the cart while the
    // products are being resolved invalidates this checkout rather than being missed.
    const version = cart?.__v ?? 0;

    const lines = await readCartLines(cart);
    const joined = lines.filter((line) => isJoined(line));

    // The cart's own choice (`PUT /cart/shipping-method`), read here rather than from the
    // request — see this module's `openapi.yaml` `CheckoutRequest` description. A stored choice the
    // basket no longer fits counts as none, exactly as the cart's own view reads it.
    const chosenMethodId = effectiveShippingChoice(
        cart?.shippingMethodId,
        shippingOptionsFor(joined).options
    );
    const shippingResolution = await resolveShipping(
        userId,
        addressId,
        chosenMethodId ?? undefined,
        needsShipping(joined)
    );
    if (!shippingResolution.ok) return shippingResolution.reject;
    const { shippingMethod, address } = shippingResolution;

    /*
     * The rule is in `../domain`; what a refusal looks like on the wire is here.
     *
     * `available` is computed here, not by the rule itself: the domain layer may not import
     * `@modules/products` to reach `availableStock`, so this is the door it comes through.
     *
     * Explicit `code`s rather than bare strings: the checkout-failure analytics
     * event reports this code, so it must stay stable and locale-independent
     * while `message` is translated for the user.
     */
    // The ledger decides how much can be sold, never the catalogue's cached copy of it.
    const availableByProduct = await inventoryService.availableFor(
        lines.map((line) => line.productId)
    );
    const verdict = evaluateCheckout(
        lines.map((line) => ({
            ...line,
            product: line.product && {
                title: line.product.title,
                active: line.product.active,
                deletedAt: line.product.deletedAt,
                available: availableByProduct.get(line.productId) ?? 0
            }
        }))
    );
    if (!verdict.ok) {
        if (verdict.reason === 'empty')
            return generateReject(409, [
                { code: ERROR_CODES.CART_EMPTY, message: t('cart.empty') }
            ]);
        if (verdict.reason === 'insufficient-stock')
            return buildStockRefusal({
                type: 'insufficient-stock',
                shortfalls: verdict.shortfalls
            });
        return buildStockRefusal({ type: 'unavailable', status: 404, lines: verdict.lines });
    }

    // A line filled before the per-line ceiling was lowered: refused here, naming the lines, rather
    // than quietly trimmed (the buyer decides what to drop).
    const maxPerLine = cartLineMax();
    const overLimit = joined.filter((line) => line.quantity > maxPerLine);
    if (overLimit.length > 0)
        return generateReject(422, [
            {
                code: ERROR_CODES.CART_QUANTITY_LIMIT,
                message: t('cart.quantity-limit'),
                details: { max: maxPerLine, productIds: overLimit.map((line) => line.productId) }
            }
        ]);

    /*
     * The rest of the rule, once shipping applicability itself is settled above: a physical
     * basket names a method, and — only when that method demands it — an address. A
     * digital-only basket needs neither.
     */
    const shippingRequirement = evaluateShippingRequirement(
        joined,
        shippingMethod,
        address !== undefined
    );
    if (!shippingRequirement.ok)
        return generateReject(422, [
            shippingRequirement.reason === 'method-required'
                ? {
                      code: ERROR_CODES.CART_SHIPPING_METHOD_REQUIRED,
                      message: t('cart.shipping-method-required')
                  }
                : { code: ERROR_CODES.CART_ADDRESS_REQUIRED, message: t('cart.address-required') }
        ]);

    // After the shipping requirement, so a physical basket short of a method or an address is
    // told that first; only then does the invoice's own address get resolved.
    const billingResolution = await resolveBilling(userId, billingAddressId, address);
    if (!billingResolution.ok) return billingResolution.reject;
    const { billingAddress } = billingResolution;

    // The price check, last of the refusals: every fixable problem above is the buyer's to fix
    // first, and nothing is held until the total they were shown is the total they would pay.
    const totalRefusal = refuseChangedTotal(joined, shippingMethod, expectedTotal);
    if (totalRefusal) return totalRefusal;

    /*
     * `bank_transfer`'s hold is `methodInfo.holdHours`, converted to the unit
     * `reserveForOrder` wants; `card` passes `undefined` through and gets its own default
     * (`NODE_RESERVATION_TTL_MINUTES`). `placeOrder` freezes `payBy` from the hold it actually
     * takes at this length — never a second, separately-computed guess.
     */
    const holdMinutes = methodInfo.holdHours === undefined ? undefined : methodInfo.holdHours * 60;

    /*
     * The write itself — freezing the lines, allocating the invoice number, minting a
     * `bank_transfer` reference and holding the stock — is `placeOrder`'s job; this function keeps
     * only what is genuinely checkout's own: the pre-flight above, and the cart clear, which
     * commits with the order (`commitWith`) so a lost race writes no order at all.
     */
    const outcome = await placeOrder({
        userId: user.id,
        email: user.email,
        locale: buyerLocale,
        notes,
        lines: joined.map((line) => ({
            item: { productId: line.productId, quantity: line.quantity },
            // Already a plain, lean object — `readCartLines` joins via `productService.findManyByIds`,
            // not a hydrated `populate()`, so no `.toObject()` cast is needed here any more.
            product: line.product
        })),
        paymentMethod: requestedMethod,
        billingAddress: toOrderAddress(billingAddress),
        shipping: {
            ...(address ? { address: toOrderAddress(address) } : {}),
            ...(shippingMethod
                ? {
                      method: {
                          id: shippingMethod.id,
                          // The shop's CURRENT currency, not a frozen one — this runs as `placeOrder`
                          // is still deciding what to freeze onto the new order. Every line counts
                          // toward the free-shipping line, as the cart's own quote counts it.
                          priceFor: (frozenLines) =>
                              shippingPriceFor(shippingMethod, frozenLines, shopCurrency())
                      }
                  }
                : {}),
            holdMinutes
        },
        // Emptied only if the cart still holds the lines this checkout read; `false` aborts the
        // order's transaction, so the cart's contents end up on exactly one of two racing orders.
        commitWith: (session) =>
            cartRepository
                .clearLinesIfUnchanged(userId, version, session)
                .then((cleared) => cleared !== null)
    });
    if (!outcome.ok) {
        if (outcome.reason === 'superseded')
            return generateReject(409, [
                { code: ERROR_CODES.CART_CHANGED, message: t('cart.changed') }
            ]);
        // `no-lines`/`product-missing` should not occur here — `evaluateCheckout` above already
        // proved the basket good — but map them defensively rather than assume the invariant.
        if (outcome.reason !== 'insufficient-stock')
            return buildStockRefusal({ type: 'unavailable', status: 409 });
        return buildStockRefusal({ type: 'insufficient-stock', shortfalls: outcome.shortfalls });
    }
    const { order } = outcome;

    // Sent from the service, not the controller: only this point knows the order stood.
    sendOrderPlacedEmail(order, buyerLocale, user.username, user.email);
    return generateSuccess<OrderDocument>(order);
};

/**
 * Create order from current user cart and empty the cart. See {@link runCheckout} for the
 * checkout logic proper; this wraps it in the database-error envelope and the checkout
 * observability side effects, which apply the same way regardless of which step failed.
 */
export const orderConfirm = (
    userId: string,
    context: CallerContext,
    choices: CheckoutChoices = {}
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    runCheckout(userId, choices)
        .catch((error: unknown) => rejectDatabaseEnvelope('cart', error))
        .then((result) => {
            /*
             * `order_created` fires here too, not just from the admin route's `create()` —
             * see docs/tools/observability-layer.md. The audit records the caller's real role,
             * whatever it is — no forced override: a purchase made by an admin is still an admin
             * action, not a synthetic "user" role.
             */
            if (result.success) {
                orderService.recordCreated(result.data, context);
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CHECKOUT_COMPLETED,
                    properties: { order_id: String(result.data._id) }
                });
            } else {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CHECKOUT_FAILED,
                    properties: { reason: result.errors[0]?.code }
                });
            }
            return result;
        });
