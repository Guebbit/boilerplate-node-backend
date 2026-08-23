/**
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
import { cartRepository } from '../repository';
import { readCartLines, toCartView, type CartLine, type CartView } from './view';

/**
 * Get user cart, each line joined with its product.
 */
export const cartGet = (userId: string): Promise<CartLine[]> =>
    cartRepository.findByUserId(userId).then((cart) => readCartLines(cart));

/**
 * Get user cart with computed summary (item count, total quantity, total price).
 */
export const cartGetWithSummary = (userId: string): Promise<CartView> =>
    cartRepository.findByUserId(userId).then((cart) => toCartView(cart));

/**
 * Shared logic for adding/setting a cart item quantity.
 *
 * **The catalogue gate lives here, not in a controller.** A cart line may only name a product the
 * storefront would show, and this is where that is decided, so every caller that adds ONE product
 * inherits it — `POST /cart`, `PUT /cart/{productId}`, and the wishlist's move-to-cart, which
 * reaches this function through the module barrel and never sees the catalogue itself.
 *
 * `./reorder` is the one caller that applies the rule itself, because it needs a different answer
 * to it: a discontinued line is SKIPPED there, not refused, so it resolves the whole order's
 * products in one pass and writes the survivors through the repository. Same predicate,
 * `findPublicById`, named in both places rather than derived twice.
 *
 * A route is the wrong place for it. Each one would have to ask the question for itself, in its
 * own words, and a route that forgets produces a stored line for a product no page will serve —
 * silently, because the view drops a reference that resolves to nothing, so the line is invisible
 * in the response that created it and shows up as a priced item at checkout. A rule every caller
 * must obey belongs under all of them rather than beside one, which is what a service layer is
 * for — see `docs/theory/layers.md`.
 *
 * `findPublicById` rather than a scope assembled here: `active`, not soft-deleted, and no variance
 * by role — the catalogue's own definition of "on sale", named once in the products module so this
 * cannot drift from what the product page will actually serve.
 *
 * Stock is deliberately NOT part of it. The shelf is checked when the cart becomes an order
 * (`./checkout`), because units are held at that moment and not before: refusing to hold a
 * sold-out product in a basket would throw away the customer's intent over a number that changes
 * by the minute.
 *
 * Then one write: the repository's update pipeline creates the cart, appends the line or rewrites
 * its quantity server-side and hands back the result, so the only remaining query is the join that
 * prices the answer.
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
    id: string
): Promise<ResponseSuccess<CartView> | ResponseReject> =>
    cartRepository.removeLine(userId, id).then((cart) => {
        if (!cart) return generateReject(404, []);
        return toCartView(cart).then((view) => generateSuccess(view, 200));
    });

/**
 * Remove all products from cart.
 *
 * Idempotent: a user with no cart document is already in the state this asks for, and the empty
 * view says so.
 */
export const cartRemove = (userId: string): Promise<CartView> =>
    cartRepository.clearLines(userId).then((cart) => toCartView(cart));
