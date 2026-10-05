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
import { productService } from '@modules/products';
import { findShippingMethod, methodFitsWeight } from '@modules/delivery';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { cartAnalyticsEvents } from '../analytics';
import { cartAuditActions } from '../audit';
import { basketWeight, needsShipping } from '../domain';
import { cartRepository, QUANTITY_LIMIT } from '../repository';
import { cartLineMax } from '../config';
import { readCartLines, toCartView, isJoined, type CartLine, type CartView } from './view';
import { ERROR_CODES } from '@api/error-codes';

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
 *
 * The envelope's status says whether a line was created (201) or an existing one written (200), so
 * the controller answers the RFC 9110 §9.3.4 status without a second read.
 *
 * The per-line ceiling (`cartLineMax()`, `NODE_CART_LINE_MAX`) is enforced here for `'set'` — the
 * contract only bounds a request to its hard 999, so a shop's lower number is checked before
 * anything is written — and by the repository for `'add'`, a new line and an existing one alike,
 * since every caller that adds goes through it. Both answer 422 `CART_QUANTITY_LIMIT`.
 */
const upsertCartItem = (
    userId: string,
    id: string,
    quantity: number,
    mode: 'set' | 'add'
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    productService.findPublicById(id).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);
        if (mode === 'set' && quantity > cartLineMax())
            return generateReject(422, [
                { code: ERROR_CODES.CART_QUANTITY_LIMIT, message: t('cart.quantity-limit') }
            ]);

        return cartRepository.upsertLine(userId, id, quantity, mode).then((result) => {
            if (result === QUANTITY_LIMIT)
                return generateReject(422, [
                    { code: ERROR_CODES.CART_QUANTITY_LIMIT, message: t('cart.quantity-limit') }
                ]);

            // 201 says a line was created; 200 that one already there changed or was left as it was.
            return toCartView(result.cart).then((view) =>
                generateSuccess(view, result.created ? 201 : 200)
            );
        });
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
 * `POST /cart` — "add to cart": a product not in the cart gets a line, one already there GROWS by
 * `quantity` (Shopify's `/cart/add`, commercetools' `addLineItem`). `PUT /cart/{productId}` is the
 * door that sets. Wraps `cartItemAddById` rather than folding the emit into it, so callers with no
 * `CallerContext` (tests, wishlist's move-to-cart) stay free of one.
 *
 * `CART_ITEM_ADDED` fires only when a line was created; growing one is a quantity change, which
 * is `CART_ITEM_UPDATED`.
 */
export const cartItemAdd = (
    userId: string,
    id: string,
    quantity: number,
    context: CallerContext
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    cartItemAddById(userId, id, quantity).then((result) => {
        if (result.success)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event:
                    result.status === 201
                        ? cartAnalyticsEvents.CART_ITEM_ADDED
                        : cartAnalyticsEvents.CART_ITEM_UPDATED,
                properties: { product_id: id, quantity }
            });
        return result;
    });

/**
 * `PUT /cart/{productId}` — set the quantity of a specific cart item: 201 when it creates the
 * line, 200 when it writes one already there (RFC 9110 §9.3.4). See {@link cartItemAdd}.
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
                event:
                    result.status === 201
                        ? cartAnalyticsEvents.CART_ITEM_ADDED
                        : cartAnalyticsEvents.CART_ITEM_UPDATED,
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
        recordAudit(context, {
            action: cartAuditActions.USER_CART_ITEM_REMOVED,
            actor_role: 'user',
            outcome: 'success',
            target_type: 'product',
            target_id: id
        });
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

/**
 * Choose, or clear, the cart's shipping method ahead of checkout — `PUT /cart/shipping-method`.
 *
 * Priced and validated against the basket as it stands right now, the same way
 * `services/checkout.ts`'s `resolveShipping` validates at the point of no return: an unknown
 * method 404s, a digital-only basket or a basket outside the method's weight range 409s, so a
 * caller learns about a mismatch here instead of only once checkout has already resolved a
 * payment method and an address. Checkout re-validates from scratch regardless — this is a UX
 * courtesy, not the enforcement point.
 *
 * `null` clears the choice (this module's own "null clears" convention, D17c) and always
 * succeeds — an empty choice can never mismatch the basket.
 */
export const cartShippingMethodSet = (
    userId: string,
    shippingMethodId: string | null
): Promise<ResponseSuccess<CartView> | ResponseReject> => {
    if (shippingMethodId === null)
        return cartRepository
            .setShippingMethod(userId, null)
            .then((cart) => toCartView(cart))
            .then((view) => generateSuccess(view));

    const method = findShippingMethod(shippingMethodId);
    if (!method)
        return Promise.resolve(
            generateReject(404, [
                {
                    code: ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND,
                    message: t('cart.shipping-method-not-found')
                }
            ])
        );

    return cartRepository.findByUserId(userId).then((cart) =>
        readCartLines(cart).then((lines) => {
            const joined = lines.filter((line) => isJoined(line));

            if (!needsShipping(joined))
                return generateReject(409, [
                    {
                        code: ERROR_CODES.CART_SHIPPING_NOT_APPLICABLE,
                        message: t('cart.shipping-not-applicable')
                    }
                ]);

            if (!methodFitsWeight(method, basketWeight(joined)))
                return generateReject(409, [
                    {
                        code: ERROR_CODES.CART_SHIPPING_METHOD_WEIGHT,
                        message: t('cart.shipping-method-weight')
                    }
                ]);

            return cartRepository
                .setShippingMethod(userId, shippingMethodId)
                .then((updated) => toCartView(updated))
                .then((view) => generateSuccess(view));
        })
    );
};
