/**
 * Checkout — the one cart operation that writes to another module's collection, and the only one
 * where a race can cost a customer money.
 */

import { Types } from 'mongoose';
import type { CastError } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type IResponseSuccess,
    type IResponseReject
} from '@infrastructure/http/response';
import { rejectDatabaseEnvelope } from '@infrastructure/http/errors';
import { orderRepository, type IOrderDocument } from '@modules/orders';
import { userRepository } from '@modules/users';
import { cartRepository } from '../repository';
import { evaluateCheckout } from '../domain';
import { isJoined, readCartLines } from './view';

/**
 * Create order from current user cart and empty the cart.
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
 */
export const orderConfirm = (
    userId: string
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> =>
    userRepository
        .findById(userId)
        .then<IResponseSuccess<IOrderDocument> | IResponseReject>((user) => {
            if (!user) return generateReject(404, []);

            return cartRepository.findByUserId(userId).then((cart) => {
                // The version the lines below are read at, and the condition the cart is emptied
                // under. Captured before the join, so anything that touches the cart while the
                // products are being resolved invalidates this checkout rather than being missed.
                const version = cart?.__v ?? 0;

                return readCartLines(cart).then((lines) => {
                    /*
                     * The rule is in `../domain`; what a refusal looks like on the wire is here.
                     *
                     * Explicit `code`s rather than bare strings: the checkout-failure analytics
                     * event reports this code, so it must stay stable and locale-independent
                     * while `message` is translated for the user.
                     */
                    const verdict = evaluateCheckout(lines);
                    if (!verdict.ok)
                        return verdict.reason === 'empty'
                            ? generateReject(409, [
                                  { code: 'CART_EMPTY', message: t('cart.empty') }
                              ])
                            : generateReject(404, [
                                  {
                                      code: 'CART_PRODUCT_UNAVAILABLE',
                                      message: t('cart.product-unavailable')
                                  }
                              ]);

                    const joined = lines.filter((line) => isJoined(line));

                    return orderRepository
                        .create({
                            userId: new Types.ObjectId(user.id),
                            email: user.email,
                            items: joined.map(({ product, quantity }) => ({ product, quantity }))
                        } as Partial<IOrderDocument>)
                        .then((order) =>
                            cartRepository
                                .clearLinesIfUnchanged(userId, version)
                                .then((clearedCart) => {
                                    if (clearedCart) return generateSuccess<IOrderDocument>(order);

                                    // Lost the race: retract the order this request wrote, so the
                                    // cart's contents end up on exactly one of them.
                                    return orderRepository.deleteOne(order).then(() =>
                                        generateReject(409, [
                                            {
                                                code: 'CART_CHANGED',
                                                message: t('cart.changed')
                                            }
                                        ])
                                    );
                                })
                        );
                });
            });
        })
        .catch((error: CastError | Error) => rejectDatabaseEnvelope('cart', error));
