/**
 * @module
 * `POST /cart/checkout` the way a client does it: read the cart, show its total, send that total
 * back as `expectedTotal`. The contract requires the field, so a spec that is not about the price
 * check goes through here instead of spelling the body out each time.
 */

import { api } from '@tests/http';

/** What a client's cart screen would show as the total, in the shape the checkout request names it (decimal text). */
export interface ShownTotal {
    amount: string;
    currency: string;
}

/**
 * The total `GET /cart` shows the caller right now.
 *
 * @param bearer - the `Authorization` header value of the shopper
 * @returns the total as the cart printed it, with its currency
 */
export const shownTotal = async (bearer: string): Promise<ShownTotal> => {
    const response = await api().get('/cart').set('Authorization', bearer);
    const { totalPrice, currency } = (
        response.body as { summary: { totalPrice: string; currency: string } }
    ).summary;
    return { amount: totalPrice, currency };
};

/**
 * Check out, naming the total the cart shows.
 *
 * @param bearer - the `Authorization` header value of the shopper
 * @param body - the rest of the request body; an `expectedTotal` here overrides the shown one
 * @param headers - extra request headers, such as an `Idempotency-Key`
 * @returns the HTTP response
 */
export const checkoutAs = async (
    bearer: string,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = {}
) =>
    api()
        .post('/cart/checkout')
        .set('Authorization', bearer)
        .set(headers)
        .send({ expectedTotal: await shownTotal(bearer), ...body });
