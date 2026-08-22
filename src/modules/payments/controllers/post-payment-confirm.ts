import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { paymentsAnalyticsEvents } from '../analytics';
import { ConfirmPaymentBody } from '@api/schemas.zod';
import { paymentsAuditActions } from '../audit';
import { paymentConfirmTotal } from '../metrics';
import { paymentService } from '../service';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /payments/:id/confirm
 * The card dialog's submit — where the money moves, so where the events fire.
 *
 * A decline is reported like any refusal (409, `PAYMENT_DECLINED`) but still counted and
 * audited: a support thread about a payment starts with "was it us or the card", and the audit
 * row answers it.
 */
export const postPaymentConfirm = (request: Request<{ id?: string }>, response: Response) => {
    const parseResult = ConfirmPaymentBody.safeParse(request.body ?? {});
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    const paymentId = String(request.params.id);
    return paymentService
        .confirmPayment(paymentId, { cardNumber: parseResult.data.cardNumber }, request.authContext)
        .then((result) => {
            const declined =
                !result.success && result.errors.some(({ code }) => code === 'PAYMENT_DECLINED');

            if (result.success || declined) {
                paymentConfirmTotal.inc({ outcome: result.success ? 'succeeded' : 'declined' });
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: result.success
                            ? paymentsAuditActions.USER_PAYMENT_SUCCEEDED
                            : paymentsAuditActions.USER_PAYMENT_DECLINED,
                        outcome: result.success ? 'success' : 'failure',
                        metadata: { payment_id: paymentId }
                    })
                );
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(request),
                    event: result.success
                        ? paymentsAnalyticsEvents.PAYMENT_SUCCEEDED
                        : paymentsAnalyticsEvents.PAYMENT_DECLINED,
                    properties: { payment_id: paymentId }
                });
            }

            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postPaymentConfirm'));
};
