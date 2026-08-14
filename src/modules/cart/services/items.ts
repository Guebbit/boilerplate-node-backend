/**
 * Reading a cart, and changing what is in it.
 *
 * Every operation here is one write plus the join that prices the answer. None of them can fail on
 * a business rule except {@link cartItemRemoveById}, which is why it is the only one carrying a
 * response envelope — see the note above the mutations.
 */

import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
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

/*
 * The mutations below return the updated cart, not a success envelope.
 *
 * Only `cartItemRemoveById` can fail, so only it carries one. The rest have no rejection to
 * report: `upsert` creates whatever is missing and clearing an already-empty cart is the state
 * the caller asked for. An envelope on those would be a union with one branch, and every
 * controller would still have to unwrap it to answer.
 */

/**
 * Shared logic for adding/setting a cart item quantity.
 *
 * One write: the repository's update pipeline creates the cart, appends the line or rewrites its
 * quantity server-side and hands back the result, so the only remaining query is the join that
 * prices the answer.
 */
const upsertCartItem = (
    userId: string,
    id: string,
    quantity: number,
    mode: 'set' | 'add'
): Promise<CartView> =>
    cartRepository.upsertLine(userId, id, quantity, mode).then((cart) => toCartView(cart));

/**
 * Set quantity of target product in cart (by ID).
 */
export const cartItemSetById = (userId: string, id: string, quantity = 1): Promise<CartView> =>
    upsertCartItem(userId, id, quantity, 'set');

/**
 * Add quantity of target product to existing quantity in cart (by ID).
 */
export const cartItemAddById = (userId: string, id: string, quantity = 1): Promise<CartView> =>
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
