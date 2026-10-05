/**
 * @module
 * Writing an order through the admin door: create, amend. `create` composes around `placeOrder`
 * (`./place`), which owns its own rollback on a refused write. Reads are in
 * `./read`, deletes in `./remove`, and cancellation is a sequence with consequences of its own in
 * `./cancel`.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import type { CartItem, UpdateOrderByIdRequest, CallerContext } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { productService } from '@modules/products';
import { userService } from '@modules/users';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { orderRepository } from '../repository';
import { placeOrder } from './place';
import { outrankedRefusal } from '@modules/access';
import { outrankedOrderRefusal } from './scope';
import { sendOrderPlacedEmail, mailBuyer } from './notify';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Report that an order was created — from the admin route or a customer's checkout
 * (`@modules/cart`'s `orderConfirm`), split out since the two paths' writes share only this
 * fact. The audit records the buyer's real role, whatever it is: no forced override — an admin
 * placing their own order is audited as `admin`, same as any other action they take.
 *
 * Audit and analytics ONLY — `ORDER_CREATED` itself is `placeOrder`'s own job (`./place.ts`), the
 * one function that actually writes a new order, so a future caller of THIS function forgetting
 * to call it can no longer also mean `webhooks` never hears about the order at all.
 */
export const recordCreated = (order: OrderDocument, context: CallerContext): void => {
    recordAudit(context, {
        action: ordersAuditActions.ORDER_CREATED,
        outcome: 'success',
        target_type: 'order',
        target_id: String(order._id)
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: ordersAnalyticsEvents.ORDER_CREATED,
        properties: { order_id: String(order._id) }
    });
};

/**
 * Looks up each line's product by id — the read `create` needs before it can freeze a snapshot.
 * @param items - `{ productId, quantity }` pairs
 * @returns each item paired with its product, or `null` when the id no longer resolves
 */
const resolveItemProducts = (
    items: CartItem[]
): Promise<{ item: CartItem; product: Awaited<ReturnType<typeof productService.findByIdRaw>> }[]> =>
    Promise.all(
        items.map((item) =>
            productService.findByIdRaw(item.productId).then((product) => ({ item, product }))
        )
    );

/**
 * Create a new order from `{ productId, quantity }` items — looks up each product and stores a
 * full snapshot.
 * @param items - `{ productId, quantity }` pairs
 * @param context - caller context for the `order_created` analytics/audit emit
 */
// `async` so `toObjectId(userId)` rejects rather than throws — malformed input must reach the
// caller as a rejected promise like every other failure here. Flat `await`s, not nested
// `.then()`s, for the same reason `@modules/cart`'s `runCheckout` uses them: each step depends
// on the last one's resolved value.
export const create = async (
    userId: string,
    email: string,
    items: CartItem[],
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    // The rank rule, asked of the buyer named in the body: an operator raises an order for a
    // customer, never for an equal or a superior. Raising one for themselves is allowed — the
    // steps that move its money then refuse them (`ownMoneyRefusalFor`).
    const outranked = await outrankedRefusal(context, userId, 'user');
    if (outranked) return outranked;

    // The snapshot each line freezes wants the BUYER's stored language, never the caller's: this
    // endpoint lets an admin place an order for someone else, and `context.locale` there is the
    // admin's own UI language, not the recipient's. Same rule as `@modules/cart`'s checkout.
    //
    // Guarded: a lookup failure here must fall back to the default locale, not abort the order
    // this endpoint is about to place. `mailBuyer`, further down, covers the same failure for the
    // placed-order email with its own independent lookup — the two normally agree, since both
    // read the same account, but neither may block on the other.
    const buyerLocale = await userService
        .getById(userId)
        .then((buyer) => buyer?.locale ?? getDefaultLocale())
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: 'Buyer lookup failed while pricing a new order; using the default locale.',
                userId,
                error
            });
            // Stryker restore all
            return getDefaultLocale();
        });

    // `Promise.all([])` settles without a query, so an empty basket still costs no round trip.
    const resolvedItems = await resolveItemProducts(items);

    // The admin path sells the same shelf the storefront does — the same write, freeze, invoice
    // allocation and stock hold `placeOrder` runs for `@modules/cart`'s checkout, with no
    // payment method or shipping: this endpoint offers neither.
    const outcome = await placeOrder({
        userId,
        email,
        locale: buyerLocale,
        lines: resolvedItems
    });
    if (!outcome.ok) {
        if (outcome.reason === 'no-lines')
            return generateReject(422, [t('generic.error-missing-data')]);
        if (outcome.reason === 'product-missing')
            return generateReject(404, [t('products.not-found')]);
        // Only a `commitWith` step can lose a race, and this door passes none.
        if (outcome.reason === 'superseded')
            throw new Error('placeOrder reported a lost race for a write with no commitWith step');
        return generateReject(409, [
            {
                code: ERROR_CODES.ORDER_INSUFFICIENT_STOCK,
                message: t('orders.insufficient-stock'),
                // Which line blocked it, and what is actually on the shelf.
                details: { lines: outcome.shortfalls }
            }
        ]);
    }
    const { order } = outcome;

    recordCreated(order, context);

    // `recordCreated` is shared with `@modules/cart`'s checkout, which sends its own placed-order
    // email, so mailing here too would double-send if this weren't split per caller. `mailBuyer`
    // re-resolves the buyer for the mail's own locale/name — see this function's own guarded
    // lookup above for why a second, independent attempt is worth the extra read.
    void mailBuyer(order, (locale, name) => sendOrderPlacedEmail(order, locale, name, email));

    return generateSuccess(order, 201, t('orders.creation-success'));
};

/**
 * Update an existing order document (admin) — `email` only. `status` is not a field this
 * function ever sees: `UpdateOrderByIdRequest` does not declare it, so there is no admin status
 * move here to refuse or apply, and no partial write between an email save and a status move to
 * guard against. See `docs/theory/tactical-ddd.md#who-writes-the-status`.
 */
export const update = (
    order: OrderDocument,
    data: UpdateOrderByIdRequest
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    if (data.email !== undefined) order.email = data.email;

    return orderRepository.save(order).then((saved) => generateSuccess(saved));
};

/**
 * Update an existing order by ID (admin).
 * Fetches the document, refuses an order whose buyer ranks at or above the caller, then
 * delegates to update().
 */
export const updateById = (
    id: string,
    data: UpdateOrderByIdRequest,
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findById(id).then((order) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return outrankedOrderRefusal(id, context).then(
            (refusal) =>
                refusal ??
                update(order, data).then((result) => {
                    if (result.success)
                        recordAudit(context, {
                            action: ordersAuditActions.ORDER_UPDATED,
                            outcome: 'success',
                            target_type: 'order',
                            target_id: id
                        });
                    return result;
                })
        );
    });
