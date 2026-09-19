/**
 * @module
 * Matching an incoming bank transfer back to the order it pays. The admin reads the RF reference
 * off the bank's own website and pastes it here; this finds the order, and `POST
 * /payments/order/{orderId}/offline` — already built for cash and phone orders — settles it. No
 * new settlement code: this file is the one step in front of that endpoint.
 */

import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { orderService, parseReference, type OrderDocument } from '@modules/orders';

/**
 * The order behind an RF reference — the admin's lookup before `recordOfflinePayment` settles it.
 * An order with no reference at all (placed before the field existed) is not reachable through
 * this endpoint; the admin finds it by id through the normal order search instead.
 *
 * @param ref - what the admin pasted, exactly as `parseReference` will read it
 * @returns the order, or a 404 for a malformed or unmatched reference alike — a client that typed
 *   the code wrong should not learn that from the response
 */
export const getOrderByReference = (
    ref: string
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const parsed = parseReference(ref);
    if (!parsed) return Promise.resolve(generateReject(404, [t('payments.order-not-found')]));

    return orderService
        .getByTransferReference(parsed)
        .then((order) =>
            order ? generateSuccess(order) : generateReject(404, [t('payments.order-not-found')])
        );
};
