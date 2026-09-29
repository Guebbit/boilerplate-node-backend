/**
 * @module
 * Staff's answer to a return request: approve it, or decline it with a reason. Each is one
 * conditional write from `requested` (`DECIDABLE_RETURN_STATUSES`), so two staff members deciding
 * the same request cannot both win — the loser is told the request was already decided.
 *
 * A withdrawal never reaches here: it is opened already approved, because nobody grants a right.
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { orderService } from '@modules/orders';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository, type ReturnStamp } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { DECIDABLE_RETURN_STATUSES } from '../domain';
import { mailReturnNotice } from './notify';

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
 * Tell the customer what was decided. The order is read only for the mail — its number, and where
 * to send it — so a vanished order costs the mail, never the decision.
 * @param decided - the return as it now stands
 * @param kind - the notice to send
 */
const notifyDecision = (
    decided: ReturnDocument,
    kind: 'return-approved' | 'return-declined'
): Promise<void> =>
    orderService.getById(String(decided.orderId)).then((order) => {
        if (!order) return undefined;
        return mailReturnNotice(kind, order, {
            returnPostage: decided.returnPostage,
            at: decided.decidedAt ?? new Date(),
            declineReason: decided.declineReason
        });
    });

/**
 * The shared shape of both decisions: the conditional move, then the audit row and the mail.
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
    returnRepository
        .claimStatus(id, DECIDABLE_RETURN_STATUSES, to, { ...stamp, decidedAt: new Date() })
        .then((decided) => {
            if (!decided) return notDecidable(id);

            recordAudit(context, {
                action:
                    to === 'approved'
                        ? returnsAuditActions.ADMIN_RETURN_APPROVED
                        : returnsAuditActions.ADMIN_RETURN_DECLINED,
                outcome: 'success',
                target_type: 'return',
                target_id: id,
                metadata: { orderId: String(decided.orderId) }
            });
            return notifyDecision(
                decided,
                to === 'approved' ? 'return-approved' : 'return-declined'
            ).then(() =>
                generateSuccess(
                    decided,
                    200,
                    t(to === 'approved' ? 'returns.approved' : 'returns.declined')
                )
            );
        });

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
 * Decline a return request, saying why.
 * @param id - the return
 * @param reason - what the customer is told — required, since a refusal nobody explains is not one
 * @param context - the staff member
 */
export const declineReturn = (
    id: string,
    reason: string,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    decide(id, 'declined', { declineReason: reason }, context);
