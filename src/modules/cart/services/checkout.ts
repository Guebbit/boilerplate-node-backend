/**
 * @module
 * Checkout — the one cart operation that writes to another module's collection, and the only one
 * where a race can cost a customer money.
 *
 * See: docs/modules/cart-checkout.md
 */

import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import {
    orderRepository,
    orderService,
    orderConfirmEmail,
    sumLineItems,
    type OrderDocument
} from '@modules/orders';
import { userRepository } from '@modules/users';
import { inventoryService } from '@modules/inventory';
import { addressForCheckout, type AddressItem } from '@modules/account';
import { findShippingMethod, priceShipping } from '@modules/delivery';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { cartAnalyticsEvents } from '../analytics';
import { cartRepository } from '../repository';
import { evaluateCheckout } from '../domain';
import { isJoined, readCartLines, type JoinedCartLine } from './view';

/**
 * The basket as `inventory` wants it — product ids and quantities, nothing else. Mapping here
 * rather than handing over the cart lines is what keeps `inventory` from learning what a cart is.
 *
 * @param lines - the checkout's resolved lines
 * @returns the same lines as stock claims
 */
const toStockLines = (lines: readonly JoinedCartLine[]) =>
    lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));

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
 * The checkout body proper, split out of {@link orderConfirm} so that function can wrap it in one
 * `.catch` for the database-error envelope and run its observability side effects uniformly over
 * both success and failure, without either concern nesting inside this one.
 *
 * Written as a single sequential `async` function rather than a `.then` chain: every step here
 * depends on the value the previous one resolved, so chaining nested a callback per step,
 * several levels past the file's usual depth. As `async`/`await` the exact same order of
 * operations reads top to bottom, and every early `return` below still rejects through the same
 * `.catch` on the caller's side, because a throw or rejection anywhere inside this function
 * rejects the promise it returns — nothing about the error handling below changed, only its shape.
 *
 * The user is loaded for one reason — an order records the address it was placed from — so a
 * checkout for an account that no longer exists is the one cart operation that can still 404.
 *
 * A line whose product no longer exists rejects the whole checkout, matching what
 * the orders service `create()` already does for an unresolvable product id: an order embeds a
 * snapshot, and there is nothing to snapshot.
 *
 * CONCURRENCY. Read cart → write order → empty cart is three statements, and until the cart write
 * was made conditional, nothing tied the third to the first. Two parallel `POST /cart/checkout`
 * both read the same lines, both wrote an order, and both emptied an already-empty cart: one cart,
 * two orders, the customer charged twice. A double-clicked button is enough to reach it.
 *
 * So the cart is emptied CONDITIONALLY, on the `__v` it was read at, and that write is what
 * decides the race — exactly one of the two matches. The loser has already created an order by
 * then, which is the cost of not using a transaction, so it deletes it and answers 409. That
 * ordering matters: the order is written first and retracted on failure, rather than the cart
 * being cleared first, because an order that briefly exists and is removed is recoverable while a
 * cart emptied without an order is a customer's basket silently thrown away.
 *
 * The 409 is deliberate rather than a retry. The loser's cart is empty and its lines are on the
 * winner's order — the request has been superseded, not defeated, and re-running it would produce
 * "empty cart" anyway. `../repository` `clearLinesIfUnchanged` documents why the guard is a
 * conditional write rather than a transaction.
 *
 * @param userId - the caller's id
 * @param addressId - the shipping address's entry id, or `undefined` for the default/no address
 * @param shippingMethodId - the chosen shipping method's id, or `undefined` for none
 */
const runCheckout = async (
    userId: string,
    addressId: string | undefined,
    shippingMethodId: string | undefined
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const user = await userRepository.findById(userId);
    if (!user) return generateReject(404, []);

    /*
     * Which method ships. Resolved BEFORE any stock moves for the same reason the
     * address is: a name that matches nothing refuses the checkout while nothing has
     * been written yet. `undefined` — no method named — is fine; shipping is not (yet)
     * required to buy, exactly like the address. The COST is priced later, once the
     * joined lines say what the items total is.
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
                message: t('cart.product-unavailable')
            }
        ]);
    }

    const joined = lines.filter((line) => isJoined(line));

    const orderItems = joined.map(({ product, quantity }) => ({
        product,
        quantity
    }));

    /*
     * The order is written first, and the units are held against it. Forced
     * rather than chosen: a hold is keyed by the order's id, and that key is what
     * makes reserving exactly once. It is also the safer half — an order that
     * briefly exists and is retracted is recoverable, units taken with nothing
     * recording who took them are not.
     */
    const order = await orderRepository.create({
        userId: new Types.ObjectId(user.id),
        email: user.email,
        items: orderItems,
        ...(address ? { shippingAddress: toShippingAddress(address) } : {}),
        // The cost frozen against THESE lines' total — the free-above
        // rule prices the basket being bought, not a later edit of it.
        ...(shippingMethod
            ? {
                  shippingMethod: shippingMethod.id,
                  shippingCost: priceShipping(shippingMethod, sumLineItems(orderItems).price)
              }
            : {})
    } as Partial<OrderDocument>);

    /*
     * Hold the units. The verdict above was only the pre-flight; this is
     * the half that holds under concurrency, and a loser gets `false`
     * with nothing half-held — the reserve rolls its own lines back.
     *
     * The units are not SOLD here. They stay on the shelf until the
     * payment lands or the hold ends, so an unpaid order no longer
     * removes stock from the world.
     */
    const outcome = await inventoryService.reserveForOrder(String(order._id), toStockLines(joined));
    if (!outcome.held) {
        // Nothing is held, so the only thing to retract is the order.
        await orderRepository.deleteOne(order);
        return generateReject(409, [
            {
                code: 'CART_INSUFFICIENT_STOCK',
                message: t('cart.insufficient-stock'),
                // What actually blocked it, read at the moment it
                // refused. Without this the customer is editing a cart
                // by trial and error.
                details: { lines: outcome.shortfalls }
            }
        ]);
    }

    const clearedCart = await cartRepository.clearLinesIfUnchanged(userId, version);
    if (clearedCart) {
        /*
         * The confirmation, from the service unlike every
         * other email: only this point knows the order stood,
         * and only here is the recipient's record in scope —
         * the email goes out in the customer's own language,
         * not the request's.
         */
        const mail = orderConfirmEmail(user.locale ?? getDefaultLocale(), user.username, order);
        void enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data);
        return generateSuccess<OrderDocument>(order);
    }

    // Lost the race: give the hold back and retract the order
    // this request wrote, so the cart's contents end up on
    // exactly one of them and the shelf agrees.
    await inventoryService.releaseForOrder(String(order._id));
    await orderRepository.deleteOne(order);
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
    shippingMethodId?: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    runCheckout(userId, addressId, shippingMethodId)
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error))
        .then((result) => {
            /*
             * `order_created` reports from here, not just from the admin route's `create()` —
             * this is what §0 of `OBSERVABILITY_EMISSION_LAYER.md` calls the whole case: a
             * customer completing checkout creates an order exactly as much as an admin typing
             * one in does, so the event that says "an order exists" has to fire on both paths.
             * `actorRole` is forced to `'user'`: a purchase is a customer action even when the
             * account making it happens to belong to an admin.
             */
            if (result.success && result.data) {
                orderService.recordCreated(result.data, context, 'user');
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
