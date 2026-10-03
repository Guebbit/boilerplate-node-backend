/**
 * @module
 * Deleting an order and undoing a soft delete. An order is a financial record, so the default is a
 * soft delete; a hard delete is refused once the order was paid (see {@link remove}).
 */

import { t } from '@infrastructure/i18n';
import type { CallerContext } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { inventoryService } from '@modules/inventory';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAuditActions } from '../audit';
import { orderRepository } from '../repository';
import { outrankedOrderRefusal } from './scope';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Remove an order document (soft or hard delete). Soft stamps `deletedAt` once — an order is a
 * financial record, so hiding it isn't destroying it; `restoreById` undoes it. Hard gives
 * the units back first: an order holds stock, and destroying the row without releasing it
 * leaves the shelf holding units for nothing, until the TTL sweep records the deletion as an
 * expiry.
 *
 * Refused outright once `paidAt` is stamped: `invoicing` freezes an invoice from that exact
 * transition, and a legal invoice document must survive the order it was issued for — the same
 * reason `docs/modules/invoicing.md` gives for the module never hard-deleting one of its own.
 * `paidAt` alone answers this, with no need to ask `invoicing` whether the freeze actually landed
 * (see `services/scope.ts`'s `invoice` flag): a paid order is worth keeping either way.
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
 * @param context - records `ORDER_DELETED`; omit for a caller with no request behind it
 */
export const remove = (
    order: OrderDocument,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    const id = String(order._id);

    if (hardDelete && order.paidAt)
        return Promise.resolve(
            generateReject(409, [
                { code: ERROR_CODES.ORDER_INVOICED, message: t('orders.invoiced') }
            ])
        );

    // HARD delete
    if (hardDelete)
        return (
            inventoryService
                // Released BEFORE the row goes, so the release can still name the order it
                // belongs to. Whether it released is not checked, for the same reason
                // `cancelById` does not check: a hold that already expired is an ordinary
                // sequence with nothing left to do about it.
                .releaseForOrder(id)
                .then(() => orderRepository.deleteOne(order))
                .then(() => {
                    if (context)
                        recordAudit(context, {
                            action: ordersAuditActions.ORDER_DELETED,
                            outcome: 'success',
                            target_type: 'order',
                            target_id: id,
                            metadata: { hardDelete: true }
                        });
                })
                .then(() => generateSuccess(undefined, 200, t('orders.hard-deleted')))
        );

    // SOFT delete — the default path for an order, which is a financial record. Already
    // deleted: nothing to do. DELETE must be safe to retry; undoing it is `restoreById`.
    if (order.deletedAt)
        return Promise.resolve(generateSuccess(order, 200, t('orders.soft-deleted')));

    order.deletedAt = new Date();
    return orderRepository.save(order).then((saved) => {
        if (context)
            recordAudit(context, {
                action: ordersAuditActions.ORDER_DELETED,
                outcome: 'success',
                target_type: 'order',
                target_id: id,
                metadata: { hardDelete: false }
            });
        return generateSuccess(saved, 200, t('orders.soft-deleted'));
    });
};

/**
 * Undo a soft delete.
 *
 * @param id - the order to restore
 * @param context - records `ORDER_RESTORED` and ranks the caller against the buyer; omit for a
 *   caller with no request behind it
 * @returns the restored order; 404 when there is none, 403 `OUTRANKED` when the buyer ranks at or
 *   above the caller, 409 when it is not soft-deleted
 */
export const restoreById = (
    id: string,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return outrankedOrderRefusal(id, context).then((refusal) => {
            if (refusal) return refusal;
            if (!order.deletedAt) return generateReject(409, [t('orders.not-deleted')]);
            order.deletedAt = undefined;
            return orderRepository.save(order).then((saved) => {
                if (context)
                    recordAudit(context, {
                        action: ordersAuditActions.ORDER_RESTORED,
                        outcome: 'success',
                        target_type: 'order',
                        target_id: id
                    });
                return generateSuccess(saved, 200, t('orders.restored'));
            });
        });
    });

/**
 * Remove an order by ID (soft or hard delete).
 * Fetches the document, refuses an order whose buyer ranks at or above the caller, then
 * delegates to remove().
 *
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
 * @param context - forwarded to {@link remove} for the audit row
 */
export const removeById = (
    id: string,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return outrankedOrderRefusal(id, context).then(
            (refusal) => refusal ?? remove(order, hardDelete, context)
        );
    });
