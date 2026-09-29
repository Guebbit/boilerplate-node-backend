/**
 * @module
 * `POST /account/export`'s own section for this module — see `module.ts`'s `personalData`. No
 * `erase`: a return is keyed by `orderId` and stores no `userId`, so there is nothing here to unlink
 * once `orders`' own `detachUserId` has broken that link on the order itself — the same Art.
 * 17(3)(b)/(e) retention exemption `invoicing` documents. A return is a legal and accounting
 * record of a consumer-rights act, not a preference.
 */

import { ownOrderIds } from '@modules/orders';
import type { ExportReturn } from '@types';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';

/**
 * A return in export shape — what the customer wrote and where it stands, never staff's internals.
 * @param returned - the return
 */
const toExportReturn = (returned: ReturnDocument): ExportReturn => ({
    id: String(returned._id),
    orderId: String(returned.orderId),
    status: returned.status,
    reason: returned.reason,
    ...(returned.note ? { note: returned.note } : {}),
    lines: returned.lines.map(({ productId, quantity, title }) => ({
        productId: String(productId),
        quantity,
        title
    })),
    ...(returned.createdAt ? { createdAt: returned.createdAt.toISOString() } : {})
});

/**
 * Every return on one account's own orders — found by the order ids, since a return is not itself
 * keyed by a user.
 * @param userId - the account requesting its export
 */
export const collectPersonalData = (userId: string): Promise<ExportReturn[]> =>
    ownOrderIds(userId)
        .then((orderIds) => returnRepository.findByOrderIds(orderIds))
        .then((returns) => returns.map((returned) => toExportReturn(returned)));
