/**
 * @module
 * Canceling an approved return whose goods never came: `approved → canceled`, staff's act. A
 * return that nobody will ever send would otherwise hold its units and keep the order at
 * `in_progress` forever.
 *
 * Bookkeeping only, like closing by hand: no money, no stock, no event, no mail. `canceled` is not
 * `closed` — it holds no units and counts as no goods back — so the same lines can be returned
 * again. A parcel lost on the way back is NOT canceled: the shop bears that risk and the refund may
 * be owed, so it is received with a restock count of 0.
 *
 * See: docs/modules/returns.md#canceling-a-return
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { orderService } from '@modules/orders';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { CANCELABLE_RETURN_STATUSES } from '../domain';
import { syncReturnStatus } from './projection';

/**
 * The answer for a cancel that found nothing to cancel: 404 for a return that does not exist, 409
 * for one that is not `approved` (or is canceled already).
 * @param id - the return
 */
const notCancelable = (id: string): Promise<ResponseReject> =>
    returnRepository.findById(id).then((existing) =>
        existing
            ? generateReject(409, [
                  {
                      code: ERROR_CODES.RETURN_NOT_CANCELABLE,
                      message: t('returns.not-cancelable')
                  }
              ])
            : generateReject(404, [t('returns.not-found')])
    );

/**
 * Cancel an approved return. One conditional write plus the order's timeline row, in one
 * transaction: a lost race writes no row. The note stays in the audit row; the timeline row
 * carries ids only.
 *
 * @param id - the return
 * @param note - why, optional
 * @param context - the staff member, audited
 * @returns the canceled return, or a refusal when it was not `approved`
 */
export const cancelReturn = (
    id: string,
    note: string | undefined,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    withTransaction((session) =>
        returnRepository
            .claimStatus(
                id,
                CANCELABLE_RETURN_STATUSES,
                'canceled',
                { canceledAt: new Date() },
                session
            )
            .then((canceled) =>
                canceled
                    ? orderService
                          .appendTimeline(
                              String(canceled.orderId),
                              {
                                  type: 'return_canceled',
                                  actor: context.caller.id,
                                  data: { returnId: id }
                              },
                              session
                          )
                          .then(() => canceled)
                    : canceled
            )
    ).then((canceled) => {
        if (!canceled) return notCancelable(id);

        recordAudit(context, {
            action: returnsAuditActions.ADMIN_RETURN_CANCELED,
            outcome: 'success',
            targetType: 'return',
            targetId: id,
            metadata: { orderId: String(canceled.orderId), ...(note ? { note } : {}) }
        });
        return syncReturnStatus(String(canceled.orderId)).then(() =>
            generateSuccess(canceled, 200)
        );
    });
