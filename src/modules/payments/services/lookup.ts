/**
 * @module
 * Matching an incoming bank transfer back to the order it pays. The admin reads the RF reference
 * off the bank's own website and pastes it here; this finds the order, and `POST
 * /payments/order/{orderId}/offline` — already built for cash and phone orders — settles it. No
 * new settlement code: this file is the one step in front of that endpoint.
 */

import {
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { orderService, type OrderDocument } from '@modules/orders';
import { parseReference } from '../domain';
import { paymentRepository } from '../repository';
import { orderNotFound } from './errors';

/**
 * The order behind an RF reference — the admin's lookup before `recordOfflinePayment` settles it.
 * An order with no reference at all (a `card` order) is not reachable through this endpoint; a raw
 * order id is not a reference either. The admin finds those by id through the normal order search.
 *
 * @param ref - what the admin pasted, exactly as `parseReference` will read it
 * @returns the order, or a 404 for a malformed or unmatched reference alike — a client that typed
 *   the code wrong should not learn that from the response
 */
export const getOrderByReference = (
    ref: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const parsed = parseReference(ref);
    if (!parsed) return Promise.resolve(orderNotFound());

    return paymentRepository
        .findByTransferReference(parsed)
        .then((payment) =>
            payment
                ? orderService
                      .getById(String(payment.orderId))
                      .then((order) => (order ? generateSuccess(order) : orderNotFound()))
                : orderNotFound()
        );
};
