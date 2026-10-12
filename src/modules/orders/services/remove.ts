/**
 * @module
 * Deleting an order and undoing a soft delete. An order is a financial record, so the default is a
 * soft delete; a hard delete is only for an order that was cancelled and never paid (see
 * {@link remove}).
 */

import { t } from '@infrastructure/i18n';
import { OrderStatus, type CallerContext } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAuditActions } from '../audit';
import { orderRepository } from '../repository';
import { outrankedOrderRefusal } from './scope';
import { deleteTimelineOf } from './timeline';
import { ERROR_CODES } from '@api/error-codes';

/** The 409 a hard delete answers with once the order is paid: its invoice must survive it. */
const orderInvoiced = (): ResponseReject =>
    generateReject(409, [{ code: ERROR_CODES.ORDER_INVOICED, message: t('orders.invoiced') }]);

/** The 404 a hard delete answers with when the order vanished between the read and the write. */
const orderMissing = (): ResponseReject => generateReject(404, [t('orders.not-found')]);

/** The 409 a hard delete answers with while the order is still open: cancel it first. */
const orderNotCancelled = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.ORDER_NOT_CANCELLED, message: t('orders.not-cancelled') }
    ]);

/**
 * Why a hard delete is refused for this order, or `undefined` when it may go.
 *
 * Paid is answered first: an invoice outranks "still open" as the reason to keep the row.
 * @param order - the order as it is now
 */
const hardDeleteRefusal = (order: OrderDocument): ResponseReject | undefined => {
    if (order.paidAt) return orderInvoiced();
    return order.status === OrderStatus.cancelled ? undefined : orderNotCancelled();
};

/**
 * The hard delete: one conditional delete, nothing else. The cancel that put the order in
 * `cancelled` already released its stock, cancelled the payment intent and announced it, so
 * this is cleanup only. On a miss the order is read again to say why.
 * @param order - the order, as the caller read it
 * @returns `undefined` when the row went, otherwise the refusal
 */
const hardDeleteCancelled = (order: OrderDocument): Promise<ResponseReject | undefined> =>
    orderRepository.deleteCancelledUnpaid(order).then((deleted) => {
        // Its timeline goes with it: a history of an order that no longer exists narrates nothing.
        if (deleted) return deleteTimelineOf(String(order._id)).then(() => undefined);
        // Moved on since the read (paid, reopened) or already gone: the current row says which.
        return orderRepository
            .findById(String(order._id))
            .then((current) =>
                current ? (hardDeleteRefusal(current) ?? orderMissing()) : orderMissing()
            );
    });

/**
 * Remove an order document (soft or hard delete). Soft stamps `deletedAt` once — an order is a
 * financial record, so hiding it isn't destroying it; `restoreById` undoes it. Hard is only for
 * an order that is `cancelled` and never paid: the cancel owns every end-of-order effect (stock,
 * payment intent, webhook), so a delete of an open order would skip them all.
 *
 * Refused (`ORDER_NOT_CANCELLED`) while the order is still open, and outright once `paidAt` is stamped: `invoicing` freezes an invoice from that exact
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

    // HARD delete
    if (hardDelete)
        return Promise.resolve(hardDeleteRefusal(order) ?? hardDeleteCancelled(order)).then(
            (refusal) => {
                if (refusal) return refusal;
                if (context)
                    recordAudit(context, {
                        action: ordersAuditActions.ORDER_DELETED,
                        outcome: 'success',
                        targetType: 'order',
                        targetId: id,
                        metadata: { hardDelete: true }
                    });
                return generateSuccess(undefined, 200, t('orders.hard-deleted'));
            }
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
                targetType: 'order',
                targetId: id,
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
                        targetType: 'order',
                        targetId: id
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
