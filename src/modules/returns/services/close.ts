/**
 * @module
 * Finishing a return once its money has gone back. Reached two ways — straight after a refund that
 * settled in the same request, and later, from `module.ts`'s `PAYMENT_REFUNDED` listener, when the
 * payment sweep completes a refund the provider first refused. Both call the same conditional move
 * (`received → closed`), so whichever arrives second finds nothing to do.
 *
 * A third way is staff's own: {@link closeReturnByHand}, for a return whose money will not follow
 * the usual way. It moves the same status but announces nothing, because no money went back.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { announceInTransaction } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { CLOSABLE_RETURN_STATUSES } from '../domain';
import { returnClosedEvent } from './outcome';
import { syncReturnStatus } from './projection';

/**
 * The move to `closed` and the order's timeline row, in the caller's transaction: the part both
 * ways of closing share. A lost race writes no row.
 *
 * @param id - the return
 * @param actor - the staff member behind the close, when one is
 * @param session - the transaction the move and the row join
 * @returns the closed return, or `null` when it was not `received`
 */
const claimClosed = (
    id: string,
    actor: string | null | undefined,
    session: ClientSession
): Promise<ReturnDocument | null> =>
    returnRepository
        .claimStatus(id, CLOSABLE_RETURN_STATUSES, 'closed', { closedAt: new Date() }, session)
        .then((closed) =>
            closed
                ? orderService
                      .appendTimeline(
                          String(closed.orderId),
                          {
                              type: 'return_closed',
                              actor,
                              data: {
                                  returnId: id,
                                  refundAmount: closed.refundAmount ?? 0,
                                  currency: closed.currency,
                                  ...(closed.remedy ? { remedy: closed.remedy } : {})
                              }
                          },
                          session
                      )
                      .then(() => closed)
                : closed
        );

/**
 * Close a received return: stamp when, announce it once, and tell the customer their money went
 * back. `return.closed` goes through the outbox, written with the status move, so it exists
 * exactly when this call was the one that closed the return.
 *
 * @internal The step beneath `receiveReturn` and the refund listener, which own the "money went
 * back" fact: it checks the state, never that the refund settled, so it is not published.
 * @param id - the return
 * @param actor - the staff member whose receipt led to this close, for the order's timeline;
 *   absent when the payment sweep closes it later
 * @returns the closed return, or `null` when it was not `received` — already closed, or never
 *   received; both mean there is nothing for this call to do
 */
export const closeReturn = (id: string, actor?: string | null): Promise<ReturnDocument | null> =>
    announceInTransaction((session) => claimClosed(id, actor, session), returnClosedEvent).then(
        (closed) => {
            if (!closed) return null;

            return syncReturnStatus(String(closed.orderId)).then(() => closed);
        }
    );

/**
 * The answer for a hand close that found nothing to close: 404 for a return that does not exist,
 * 409 for one that is not `received` (or is closed already).
 * @param id - the return
 */
const notClosable = (id: string): Promise<ResponseReject> =>
    returnRepository.findById(id).then((existing) =>
        existing
            ? generateReject(409, [
                  {
                      code: ERROR_CODES.RETURN_NOT_CLOSABLE,
                      message: t('returns.not-closable')
                  }
              ])
            : generateReject(404, [t('returns.not-found')])
    );

/**
 * Close a received return by staff's own hand, for the refund that will not follow the usual way
 * (canceled, or paid outside the application). No money and no stock move, and `return.closed` is
 * NOT announced: its mail tells the customer their money went back, which is not what happened.
 * The note stays in the audit row; the timeline row carries ids and numbers only.
 *
 * @param id - the return
 * @param note - why, optional
 * @param context - the staff member, audited
 * @returns the closed return, or a refusal when it was not `received`
 */
export const closeReturnByHand = (
    id: string,
    note: string | undefined,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    withTransaction((session) => claimClosed(id, context.caller.id, session)).then((closed) => {
        if (!closed) return notClosable(id);

        recordAudit(context, {
            action: returnsAuditActions.ADMIN_RETURN_CLOSED,
            outcome: 'success',
            targetType: 'return',
            targetId: id,
            metadata: { orderId: String(closed.orderId), ...(note ? { note } : {}) }
        });
        return syncReturnStatus(String(closed.orderId)).then(() => generateSuccess(closed, 200));
    });
