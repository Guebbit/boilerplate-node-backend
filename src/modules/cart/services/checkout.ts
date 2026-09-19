/**
 * @module
 * Checkout — the one cart operation that writes to another module's collection, and the only one
 * where a race can cost a customer money.
 *
 * See: docs/modules/cart-checkout.md
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { bankTransferMaxOpenPerAccount } from '@modules/orders';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import type { Lean } from '@infrastructure/persistence/create-repository';
import {
    orderService,
    placeOrder,
    sendOrderPlacedEmail,
    retractOrder,
    sumLineItems,
    type OrderDocument
} from '@modules/orders';
import type { ProductDocument } from '@modules/products';
import { userService } from '@modules/users';
import { addressForCheckout, type AddressItem } from '@modules/addresses';
import { findShippingMethod, methodFitsWeight, priceShipping } from '@modules/delivery';
import { paymentService } from '@modules/payments';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { cartRepository } from '../repository';
import { evaluateCheckout, basketWeight } from '../domain';
import { isJoined, readCartLines } from './view';

/**
 * The snapshot an order embeds, from a book entry: the shipment's fields, none of the book's.
 * Spelled field by field so the entry's `_id`/`default` cannot ride along into the order.
 */
const toShippingAddress = (address: AddressItem) => ({
    fullName: address.fullName,
    street: address.street,
    city: address.city,
    zip: address.zip,
    country: address.country,
    ...(address.phone === undefined ? {} : { phone: address.phone })
});

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
 * @param addressId - the shipping address's entry id, or `undefined` for the default/no address
 * @param shippingMethodId - the chosen shipping method's id, or `undefined` for none
 * @param paymentMethod - the chosen payment method's id, or `undefined` for `card`
 */
const runCheckout = async (
    userId: string,
    addressId: string | undefined,
    shippingMethodId: string | undefined,
    paymentMethod: string | undefined
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const user = await userService.getById(userId);
    if (!user) return generateReject(404, []);

    // The whole language chain for this checkout — both the snapshot each line freezes and,
    // further down, the confirmation email — decided once so the two cannot disagree.
    const buyerLocale = user.locale ?? getDefaultLocale();

    /*
     * Resolved before any stock moves, same as the shipping method below: an unoffered method
     * refuses the checkout while nothing has been written yet. `GET /payments/methods`'
     * own list is asked rather than re-checked here, so the two can never disagree about what
     * this deployment offers.
     */
    const requestedMethod = paymentMethod ?? 'card';
    const methodInfo = paymentService
        .listPaymentMethods()
        .find((method) => method.id === requestedMethod);
    if (!methodInfo)
        return generateReject(409, [
            {
                code: 'CART_PAYMENT_METHOD_NOT_AVAILABLE',
                message: t('cart.payment-method-not-available')
            }
        ]);

    /*
     * The open-transfer cap: a week-long hold is otherwise free to take, so this is what stops
     * one account hoarding stock across many uncompleted orders. Checked here, before anything
     * is written, for the same reason every other pre-flight check in this function is.
     */
    if (requestedMethod === 'bank_transfer') {
        const openTransfers = await orderService.countOpenBankTransfers(userId);
        if (openTransfers >= bankTransferMaxOpenPerAccount())
            return generateReject(409, [
                { code: 'CART_BANK_TRANSFER_LIMIT', message: t('cart.bank-transfer-limit') }
            ]);
    }

    /*
     * Resolved before any stock moves: an unmatched name refuses the checkout while
     * nothing has been written yet. `undefined` (no method named) is fine — shipping
     * isn't required to buy. Cost is priced later, once the joined lines total.
     */
    const shippingMethod =
        shippingMethodId === undefined ? undefined : findShippingMethod(shippingMethodId);
    if (shippingMethodId !== undefined && !shippingMethod)
        return generateReject(404, [
            {
                code: 'CART_SHIPPING_METHOD_NOT_FOUND',
                message: t('cart.shipping-method-not-found')
            }
        ]);

    /*
     * Which address ships. Resolved BEFORE any stock moves: a named entry that is not
     * the caller's refuses the checkout while nothing has been written yet. `undefined`
     * — no entry named, none default — is fine; an address is not required to buy.
     */
    const address = await addressForCheckout(userId, addressId);
    if (address === null)
        return generateReject(404, [
            {
                code: 'CART_ADDRESS_NOT_FOUND',
                message: t('cart.address-not-found')
            }
        ]);

    const cart = await cartRepository.findByUserId(userId);
    // The version the lines below are read at, and the condition the cart is emptied
    // under. Captured before the join, so anything that touches the cart while the
    // products are being resolved invalidates this checkout rather than being missed.
    const version = cart?.__v ?? 0;

    const lines = await readCartLines(cart);

    /*
     * The rule is in `../domain`; what a refusal looks like on the wire is here.
     *
     * Explicit `code`s rather than bare strings: the checkout-failure analytics
     * event reports this code, so it must stay stable and locale-independent
     * while `message` is translated for the user.
     */
    const verdict = evaluateCheckout(lines);
    if (!verdict.ok) {
        if (verdict.reason === 'empty')
            return generateReject(409, [{ code: 'CART_EMPTY', message: t('cart.empty') }]);
        if (verdict.reason === 'insufficient-stock')
            return generateReject(409, [
                {
                    code: 'CART_INSUFFICIENT_STOCK',
                    message: t('cart.insufficient-stock'),
                    // Every short line, so the customer fixes the basket in one
                    // pass instead of one refusal per line.
                    details: { lines: verdict.shortfalls }
                }
            ]);
        return generateReject(404, [
            {
                code: 'CART_PRODUCT_UNAVAILABLE',
                message: t('cart.product-unavailable'),
                // Every unavailable line, the same reasoning `CART_INSUFFICIENT_STOCK` above
                // already follows — a customer fixes the basket in one pass, not one refusal per
                // line. `title` is absent for a hard-deleted product: there is nothing left to
                // read one off.
                details: { lines: verdict.lines }
            }
        ]);
    }

    const joined = lines.filter((line) => isJoined(line));

    /*
     * A method was named, but nothing in the basket needs one — every line is a digital good
     * (`requiresShipping: false`). Refused rather than silently ignored: a client that thinks it
     * is paying for shipping on a purchase that never ships should not proceed uncorrected.
     */
    if (shippingMethod && joined.every(({ product }) => product.requiresShipping === false))
        return generateReject(409, [
            {
                code: 'CART_SHIPPING_NOT_APPLICABLE',
                message: t('cart.shipping-not-applicable')
            }
        ]);

    /*
     * Enforced here, not just at `GET /delivery/methods`: that list is advisory (it filters by
     * whatever weight the CLIENT last computed), so the basket's real weight — joined
     * server-side, right now — is what actually decides whether the chosen method may carry it.
     */
    if (shippingMethod && !methodFitsWeight(shippingMethod, basketWeight(joined)))
        return generateReject(409, [
            {
                code: 'CART_SHIPPING_METHOD_WEIGHT',
                message: t('cart.shipping-method-weight')
            }
        ]);

    /*
     * `bank_transfer`'s hold is `methodInfo.holdHours`, converted to the unit
     * `reserveForOrder` and `payBy` both want; `card` passes `undefined` through and gets
     * `reserveForOrder`'s own default (`NODE_RESERVATION_TTL_MINUTES`) — nothing about the
     * existing card flow's timing changes.
     */
    const holdMinutes = methodInfo.holdHours === undefined ? undefined : methodInfo.holdHours * 60;
    const payBy =
        holdMinutes === undefined ? undefined : new Date(Date.now() + holdMinutes * 60_000);

    /*
     * The write itself — freezing the lines, allocating the invoice number, minting a
     * `bank_transfer` reference and holding the stock — is `placeOrder`'s job; this function keeps
     * only what is genuinely checkout's own: the pre-flight above, and the cart-clearing/lost-race
     * handling below.
     *
     * `.toObject()`: `product` here is a hydrated document from `readCartLines`'s `populate()` —
     * see that function's own docblock. Cast, not inferred: `ProductDocument`'s untyped `DocType`
     * generic makes Mongoose's own `toObject()` overload resolve to `any`; `Lean<ProductDocument>`
     * is the plain shape it actually returns at runtime.
     */
    const outcome = await placeOrder({
        userId: user.id,
        email: user.email,
        locale: buyerLocale,
        lines: joined.map((line) => ({
            item: { productId: line.productId, quantity: line.quantity },
            product: line.product.toObject() as Lean<ProductDocument>
        })),
        paymentMethod: requestedMethod,
        payBy,
        shipping: {
            ...(address ? { address: toShippingAddress(address) } : {}),
            ...(shippingMethod
                ? {
                      method: {
                          id: shippingMethod.id,
                          priceFor: (frozenLines) =>
                              priceShipping(shippingMethod, sumLineItems(frozenLines).price)
                      }
                  }
                : {}),
            holdMinutes
        }
    });
    if (!outcome.ok) {
        // `no-lines`/`product-missing` should not occur here — `evaluateCheckout` above already
        // proved the basket good — but map them defensively rather than assume the invariant.
        if (outcome.reason !== 'insufficient-stock')
            return generateReject(409, [
                { code: 'CART_PRODUCT_UNAVAILABLE', message: t('cart.product-unavailable') }
            ]);
        return generateReject(409, [
            {
                code: 'CART_INSUFFICIENT_STOCK',
                message: t('cart.insufficient-stock'),
                // What actually blocked it, read at the moment it refused. Without this the
                // customer is editing a cart by trial and error.
                details: { lines: outcome.shortfalls }
            }
        ]);
    }
    const { order } = outcome;

    const clearedCart = await cartRepository.clearLinesIfUnchanged(userId, version);
    if (clearedCart) {
        // Sent from the service, not the controller: only this point knows the order stood.
        sendOrderPlacedEmail(order, buyerLocale, user.username, user.email);
        return generateSuccess<OrderDocument>(order);
    }

    // Lost the race: hand the units back and retract the order this request
    // wrote, so the cart's contents end up on exactly one of the two.
    await retractOrder(order, true);
    return generateReject(409, [{ code: 'CART_CHANGED', message: t('cart.changed') }]);
};

/**
 * Create order from current user cart and empty the cart. See {@link runCheckout} for the
 * checkout logic proper; this wraps it in the database-error envelope and the checkout
 * observability side effects, which apply the same way regardless of which step failed.
 */
export const orderConfirm = (
    userId: string,
    context: CallerContext,
    addressId?: string,
    shippingMethodId?: string,
    paymentMethod?: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    runCheckout(userId, addressId, shippingMethodId, paymentMethod)
        .catch((error: unknown) => rejectDatabaseEnvelope('cart', error))
        .then((result) => {
            /*
             * `order_created` fires here too, not just from the admin route's `create()` —
             * see docs/tools/observability-layer.md. The audit records the caller's real role,
             * whatever it is — no forced override (`DDD_FIX.md` D3.4).
             */
            if (result.success && result.data) {
                orderService.recordCreated(result.data, context);
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CHECKOUT_COMPLETED,
                    properties: { order_id: String(result.data._id) }
                });
            } else if (!result.success) {
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: cartAnalyticsEvents.CHECKOUT_FAILED,
                    properties: { reason: result.errors[0]?.code }
                });
            }
            return result;
        });
