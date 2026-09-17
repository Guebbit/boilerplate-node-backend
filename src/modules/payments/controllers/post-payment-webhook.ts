/**
 * @module
 * POST /payments/webhook
 * Where the provider reports what actually happened to a payment — and the authority for it; the
 * browser's word never is. Four rules, all of them load-bearing:
 *
 * 1. **No session auth.** The caller is a machine with no account. It authenticates by signing the
 *    raw body, which is stronger than any cookie this API could ask it for — and adding a second
 *    check on top would only break deliveries.
 * 2. **The RAW body**, never a re-serialised object: a signature covers exact bytes.
 * 3. **Deduplicated by event id**, behind the service. A provider retries until it gets a 2xx.
 * 4. **200 for anything authentic**, including events this module ignores. A non-2xx tells the
 *    provider the delivery failed, and it comes back harder. Only an unverifiable body is a 400,
 *    because that is not a delivery — and a genuine fault is left to become a 500, since that IS
 *    a retry worth having.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';
import { catchAs } from '@infrastructure/http/controller';
import { resolvePaymentProvider, WebhookRejected, WEBHOOK_SIGNATURE_HEADER } from '../providers';
import { paymentService } from '../services';

/** Handles `POST /payments/webhook`. */
export const postPaymentWebhook = (request: Request, response: Response) => {
    // `express.json`'s `verify` hook keeps the buffer for this route alone (see `app/security.ts`);
    // an absent one means that ordering changed and every signature would now fail to verify.
    const { rawBody, headers } = request;
    if (!rawBody) {
        logger.error({
            message:
                'Payment webhook reached its controller without a raw body — the parser ordering in installSecurity has been changed.'
        });
        rejectResponse(response, 400, [t('payments.webhook-unverified')]);
        return;
    }

    return Promise.resolve()
        .then(() =>
            resolvePaymentProvider().parseWebhook(
                rawBody,
                String(headers[WEBHOOK_SIGNATURE_HEADER] ?? '')
            )
        )
        .then((event) => paymentService.applyWebhookDelivery(event))
        .then(() => {
            successResponse(response, undefined, 200, t('payments.webhook-accepted'));
        })
        .catch((error: unknown) => {
            if (error instanceof WebhookRejected) {
                // `error.message` IS the reason — 'Malformed signature header', 'Signature
                // timestamp outside tolerance', 'Signature does not match', 'Body is not valid
                // JSON', or 'Event carries no id'. A fixed headline here would be right for one of
                // those and a guess for the other four.
                logger.warn({ message: `Payment webhook rejected: ${error.message}` });
                rejectResponse(response, 400, [t('payments.webhook-unverified')]);
                return;
            }
            // Anything else is ours, and a 500 is the right answer: the provider retries, and a
            // transient database failure is exactly what a retry fixes.
            catchAs(response, 'postPaymentWebhook')(error);
        });
};
