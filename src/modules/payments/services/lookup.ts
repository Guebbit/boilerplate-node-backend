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
import { orderService, type OrderDocument } from '@modules/orders';
import { parseReference } from '../domain/reference';

/**
 * Every raw ObjectId string `parseReference` returns is exactly 24 lowercase hex characters — a
 * shape a valid RF reference (fixed at 23, and always starting `RF`) can never take, so this is a
 * safe branch, not a heuristic.
 */
const isRawObjectId = (value: string): boolean => /^[\da-f]{24}$/.test(value);

/**
 * The order behind an RF reference (or, for an order that predates that field, a raw id) — the
 * admin's lookup before `recordOfflinePayment` settles it.
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

    // `getById` answers `undefined` for a miss, `getByTransferReference` `null` — both mean 404.
    const found: Promise<OrderDocument | null | undefined> = isRawObjectId(parsed)
        ? orderService.getById(parsed)
        : orderService.getByTransferReference(parsed);

    return found.then((order) =>
        order ? generateSuccess(order) : generateReject(404, [t('payments.order-not-found')])
    );
};
