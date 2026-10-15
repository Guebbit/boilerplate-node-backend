/**
 * @module
 * The buyer's "keep waiting" for a late preorder: the one answer to the question a late date asks
 * that is not a cancel. It clears the window after which silence would cancel and refund.
 *
 * Only the order's own buyer answers: a staff member cannot say yes for them, and the consent law
 * (FTC 16 CFR 435.2, CRD Art. 18) is about what the buyer agreed to.
 *
 * See: docs/modules/delivery.md#preorders-and-a-moved-date
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { isBuyer, orderService } from '@modules/orders';
import { FulfillmentConsent } from '@types';
import type { AuthContext, CallerContext, FulfillmentOrder } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { isAwaitingAnswer } from '../domain';
import { deliveryAuditActions } from '../audit';
import { fulfillmentOrderRepository } from '../repository';
import { refuse, refuseMissing, runAct } from './act';
import { viewFulfillmentOrder } from './actions';

/**
 * Say "keep waiting": `consent` becomes `confirmed` and the deadline goes.
 *
 * @param fulfillmentOrderId - the fulfillment order the buyer will keep waiting for
 * @param authContext - the caller, who must be the order's own buyer
 * @param context - the caller, for the audit entry
 */
export const confirmWait = (
    fulfillmentOrderId: string,
    authContext: AuthContext,
    context: CallerContext
): Promise<ResponseSuccess<FulfillmentOrder> | ResponseReject> =>
    fulfillmentOrderRepository.findById(fulfillmentOrderId).then((found) => {
        if (!found) return generateReject(404, [t('delivery.fulfillment-order-not-found')]);

        // The order's own scope: someone else's fulfillment order does not exist for the caller.
        return orderService
            .getById(String(found.orderId), orderService.callerScope(authContext))
            .then((order) => {
                if (!order) return generateReject(404, [t('delivery.order-not-found')]);
                if (!isBuyer(order, authContext)) {
                    auditForbidden(context, {
                        targetType: 'order',
                        targetId: String(order._id),
                        metadata: { reason: 'not_the_buyer' }
                    });
                    return generateReject(403, [t('generic.error-forbidden')]);
                }

                return runAct(async (session) => {
                    const current = await fulfillmentOrderRepository.findInSession(
                        fulfillmentOrderId,
                        session
                    );
                    if (!current) return refuseMissing('delivery.fulfillment-order-not-found');
                    if (!isAwaitingAnswer(current))
                        return refuse(
                            409,
                            ERROR_CODES.DELIVERY_NOT_AWAITING_ANSWER,
                            'delivery.not-awaiting-answer'
                        );

                    const confirmed = await fulfillmentOrderRepository.claim(
                        fulfillmentOrderId,
                        current.revision,
                        { consent: FulfillmentConsent.confirmed, unset: ['consentDeadline'] },
                        session
                    );
                    if (!confirmed)
                        return refuse(
                            409,
                            ERROR_CODES.DELIVERY_NOT_AWAITING_ANSWER,
                            'delivery.not-awaiting-answer'
                        );

                    await orderService.appendTimeline(
                        String(order._id),
                        {
                            type: 'wait_confirmed',
                            actor: authContext.id,
                            data: { fulfillmentOrderId }
                        },
                        session
                    );
                    return confirmed;
                }).then((result) => {
                    if (result.refused) return result.reject;
                    recordAudit(context, {
                        action: deliveryAuditActions.BUYER_WAIT_CONFIRMED,
                        outcome: 'success',
                        targetType: 'order',
                        targetId: String(order._id),
                        metadata: { fulfillmentOrderId }
                    });
                    return generateSuccess(viewFulfillmentOrder(result.value, order, authContext));
                });
            });
    });
