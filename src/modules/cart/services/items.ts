/**
 * @module
 * Reading a cart, and changing what is in it.
 *
 * Every operation here is one write plus the join that prices the answer. The three that name a
 * PRODUCT carry a response envelope, because each of them can be asked about one the cart may not
 * hold; {@link cartRemove} names none and cannot fail, so it does not carry one — clearing an
 * already-empty cart is the state the caller asked for.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { productRepository } from '@modules/products';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { cartAnalyticsEvents } from '../analytics';
import { cartAuditActions } from '../audit';
import { cartRepository } from '../repository';
import { readCartLines, toCartView, type CartLine, type CartView } from './view';

/**
 * Get user cart, each line joined with its product.
 */
export const cartGet = (userId: string): Promise<CartLine[]> =>
    cartRepository.findByUserId(userId).then((cart) => readCartLines(cart));

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 *
 * Split by caller intent, not by data: a person opening their basket and a badge polling a count
 * run the identical read, but only one of them is a `cart_viewed` moment.
 */
const cartViewOf = (userId: string): Promise<CartView> =>
    cartRepository.findByUserId(userId).then((cart) => toCartView(cart));

/** GET /cart/summary — the header badge polling a count. Never counts as viewing the cart. */
export const cartGetForBadge = cartViewOf;

/** GET /cart — a person looking at their basket. The one of the two that is a `cart_viewed` moment. */
export const cartGetForView = (userId: string, context: CallerContext): Promise<CartView> =>
    cartViewOf(userId).then((view) => {
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: cartAnalyticsEvents.CART_VIEWED
        });
        return view;
    });

/**
 * Shared logic for adding/setting a cart item quantity.
 *
 * The catalogue gate — may this product be in a cart — lives here, not in a controller, so every
 * single-product caller (`POST /cart`, `PUT /cart/{productId}`, wishlist move-to-cart) inherits it
 * via `findPublicById`. `./reorder` applies the same predicate itself because it SKIPS unavailable
 * lines rather than refusing. Stock is deliberately excluded here — checked only at checkout,
 * where units are actually held.
 */
const upsertCartItem = (
    userId: string,
    id: string,
    quantity: number,
    mode: 'set' | 'add'
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    productRepository.findPublicById(id).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);

        return cartRepository
            .upsertLine(userId, id, quantity, mode)
            .then((cart) => toCartView(cart))
            .then((view) => generateSuccess(view));
    });

/**
 * Set quantity of target product in cart (by ID).
 *
 * The envelope carries no message: what to call a successful write is the caller's to say, and
 * `POST /cart` and `PUT /cart/{productId}` say different things about the same operation.
 */
export const cartItemSetById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    upsertCartItem(userId, id, quantity, 'set');

/**
 * `POST /cart` — add a product to the cart, or replace the quantity of a line already there.
 * Wraps `cartItemSetById` rather than folding the emit into it, so callers with no
 * `CallerContext` (tests, `PUT`'s own wrapper below) stay free of one.
 */
export const cartItemAdd = (
    userId: string,
    id: string,
    quantity: number,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    cartItemSetById(userId, id, quantity).then((result) => {
        if (result.success)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: cartAnalyticsEvents.CART_ITEM_ADDED,
                properties: { product_id: id, quantity }
            });
        return result;
    });

/**
 * `PUT /cart/{productId}` — set the quantity of a specific cart item. See {@link cartItemAdd}.
 */
export const cartItemUpdateQuantity = (
    userId: string,
    id: string,
    quantity: number,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    cartItemSetById(userId, id, quantity).then((result) => {
        if (result.success)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: cartAnalyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: id, quantity }
            });
        return result;
    });

/**
 * Add quantity of target product to existing quantity in cart (by ID).
 */
export const cartItemAddById = (
    userId: string,
    id: string,
    quantity = 1
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    upsertCartItem(userId, id, quantity, 'add');

/**
 * Remove target product from cart (by ID).
 *
 * 404 rather than a silent success: a client deleting a line it cannot see needs to know its view
 * is stale. The repository's filter asks for the cart AND the line, so a `null` result covers both
 * "no cart" and "no such line" without a second query.
 */
export const cartItemRemoveById = (
    userId: string,
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    cartRepository.removeLine(userId, id).then((cart) => {
        if (!cart) return generateReject(404, []);
        emitAuditEvent(
            buildAuditEvent(context, {
                action: cartAuditActions.USER_CART_ITEM_REMOVED,
                actor_role: 'user',
                outcome: 'success',
                target_type: 'product',
                target_id: id
            })
        );
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: cartAnalyticsEvents.CART_ITEM_REMOVED,
            properties: { product_id: id }
        });
        return toCartView(cart).then((view) => generateSuccess(view, 200));
    });

/**
 * Remove all products from cart.
 *
 * Idempotent: a user with no cart document is already in the state this asks for, and the empty
 * view says so.
 */
export const cartRemove = (userId: string, context: CallerContext): Promise<CartView> =>
    cartRepository.clearLines(userId).then((cart) =>
        toCartView(cart).then((view) => {
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: cartAnalyticsEvents.CART_CLEARED,
                properties: {}
            });
            return view;
        })
    );
