/**
 * @module
 * Staff's answer to a return request: approve it, or decline it with a reason. Each is one
 * conditional write from `requested` (`DECIDABLE_RETURN_STATUSES`), so two staff members deciding
 * the same request cannot both win — the loser is told the request was already decided.
 *
 * A withdrawal never reaches here: it is opened already approved, because nobody grants a right.
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { ownOrderFlag } from '@modules/access';
import { buyerIdOf, orderService } from '@modules/orders';
import type { CallerContext, ReturnDeclineReason } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository, type ReturnStamp } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { DECIDABLE_RETURN_STATUSES } from '../domain';
import { RETURN_DECIDED } from '../events';
import { syncReturnStatus } from './projection';

/**
 * What a lost race, or a request already answered, looks like: 404 for a return that does not
 * exist, 409 for one that exists but is no longer waiting. The write already decided; this read
 * only chooses the sentence.
 * @param id - the return
 */
const notDecidable = (id: string): Promise<ResponseReject> =>
    returnRepository.findById(id).then((existing) =>
        existing
            ? generateReject(409, [
                  {
                      code: ERROR_CODES.RETURN_NOT_DECIDABLE,
                      message: t('returns.not-decidable')
                  }
              ])
            : generateReject(404, [t('returns.not-found')])
    );

/**
 * The shared shape of both decisions: the conditional move, then the audit row.
 *
 * @param id - the return being decided
 * @param to - `approved` or `declined`
 * @param stamp - facts that belong to this decision, written in the same statement
 * @param context - the staff member, for audit
 */
const decide = (
    id: string,
    to: 'approved' | 'declined',
    stamp: ReturnStamp,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    // The order's timeline row and `return.decided` commit with the decision; a lost race writes none. A
    // decline's reason stays on the return, where `reap:returns` owns its clock.
    withTransaction((session) =>
        returnRepository
            .claimStatus(
                id,
                DECIDABLE_RETURN_STATUSES,
                to,
                { ...stamp, decidedAt: new Date() },
                session
            )
            .then((decided) =>
                decided
                    ? orderService
                          .appendTimeline(
                              String(decided.orderId),
                              {
                                  type: to === 'approved' ? 'return_approved' : 'return_declined',
                                  actor: context.caller.id,
                                  data: { returnId: id }
                              },
                              session
                          )
                          .then(() =>
                              enqueueOutboxEvent(
                                  RETURN_DECIDED,
                                  { returnId: id, orderId: String(decided.orderId), decision: to },
                                  String(decided.orderId),
                                  session
                              )
                          )
                          .then(() => decided)
                    : decided
            )
    ).then<ResponseSuccess<ReturnDocument> | ResponseReject>((decided) =>
        decided ? settleDecision(decided, to, id, context) : notDecidable(id)
    );

/**
 * What follows a won claim: the audit row and the order's projection. The customer's mail rides
 * `return.decided`.
 *
 * @param decided - the return as the claim left it
 * @param to - `approved` or `declined`
 * @param id - the return
 * @param context - the staff member, for audit
 */
const settleDecision = (
    decided: ReturnDocument,
    to: 'approved' | 'declined',
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument>> => {
    nudgeOutbox();

    // The order is read for one fact: whether the staff member is its buyer, which the audit row
    // says (`ownOrder`) so a review sees an approval of one's own return at a glance. The decision
    // has already committed, so a failed read costs the flag and never the audit row.
    return orderService
        .getById(String(decided.orderId))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Returns: could not read order ${String(decided.orderId)} for the audit flag`,
                error
            });
            // Stryker restore all
            return null;
        })
        .then((order) => {
            recordAudit(context, {
                action:
                    to === 'approved'
                        ? returnsAuditActions.ADMIN_RETURN_APPROVED
                        : returnsAuditActions.ADMIN_RETURN_DECLINED,
                outcome: 'success',
                targetType: 'return',
                targetId: id,
                metadata: {
                    orderId: String(decided.orderId),
                    ...ownOrderFlag(context, order ? buyerIdOf(order) : undefined)
                }
            });
            return syncReturnStatus(String(decided.orderId));
        })
        .then(() => generateSuccess(decided, 200));
};

/**
 * Approve a return request — the customer may now send the goods back.
 * @param id - the return
 * @param context - the staff member
 */
export const approveReturn = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> => decide(id, 'approved', {}, context);

/**
 * The 422 for `other` with nothing written: "other" alone tells the buyer nothing.
 */
const messageRequired = (): ResponseReject =>
    generateReject(422, [fieldError('message', t('returns.decline-message-required'))]);

/**
 * Decline a return request, saying why: a code the buyer reads in their own language, and a message
 * when the code is `other`. Checked before anything is written.
 * @param id - the return
 * @param decline - the code and the optional message to the buyer
 * @param context - the staff member
 */
export const declineReturn = (
    id: string,
    decline: { reason: ReturnDeclineReason; message?: string | undefined },
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> => {
    if (decline.reason === 'other' && !decline.message) return Promise.resolve(messageRequired());

    return decide(
        id,
        'declined',
        {
            declineReason: decline.reason,
            ...(decline.message ? { declineMessage: decline.message } : {})
        },
        context
    );
};
