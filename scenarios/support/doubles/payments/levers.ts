/**
 * @module
 * The demo profile's payments levers: `POST /__test/payments/refund-failure`, which makes the fake
 * PSP refuse an order's refunds (or stop refusing), and `POST /__test/payments/dispute`, which has
 * the buyer's bank dispute an order's payment (or move the dispute along).
 *
 * Its own file, beside `./fake`, because `payments` is a `group: shop` module and `demo:remove`
 * deletes the folder with it. `../levers.generated.ts` is rebuilt from the folders that remain, so
 * the demo's control surface (`../../demo.ts`) never names a module.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { DisputeKind, DisputeReason, DisputeStatus, RefundFailureReason } from '@types';
import { paymentService } from '@modules/payments';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { connection } from '@infrastructure/runtime/database';
import { setFakeDispute, setFakeRefundFailure } from './fake';

/**
 * The body of `POST /__test/payments/refund-failure`: the order, and the closed code every refund
 * on its payment should refuse with, or `null` to let refunds through again.
 */
const REFUND_FAILURE_BODY = z.object({
    orderId: z.string().refine((value) => ObjectId.isValid(value), 'not an order id'),
    reason: z.enum(RefundFailureReason).nullable()
});

/**
 * The body of `POST /__test/payments/dispute`: the order, and the dispute's state as the provider
 * would report it. Everything but the order has a default, so `{ orderId }` opens a chargeback for
 * the whole payment with two weeks to answer. A repeated `disputeId` is the same dispute: send a
 * new `status` to move it along.
 */
const DISPUTE_BODY = z.object({
    orderId: z.string().refine((value) => ObjectId.isValid(value), 'not an order id'),
    disputeId: z.string().min(1).max(200).default('dp_demo'),
    kind: z.enum(DisputeKind).default('chargeback'),
    status: z.enum(DisputeStatus).default('needs_response'),
    reason: z.enum(DisputeReason).default('fraudulent'),
    amount: z.number().positive().optional(),
    evidenceInDays: z.number().positive().default(14)
});

/**
 * An order's payment, read straight from the collection: the wire shape hides the provider's id,
 * and the levers are the only callers that need it.
 */
const paymentOf = (
    orderId: string
): Promise<{ providerRef?: string; amount?: unknown; currency?: string } | null> =>
    connection
        .collection<{ providerRef?: string; amount?: unknown; currency?: string }>('payments')
        .findOne({ orderId: new ObjectId(orderId) });

/** The provider's id for an order's payment. */
const providerRefOf = (orderId: string): Promise<string | undefined> =>
    paymentOf(orderId).then((payment) => payment?.providerRef);

/**
 * Mount the dispute lever: store the provider's report in the fake and deliver it through the
 * service, as the webhook route would after verifying the signature.
 * @param app - the application being assembled
 */
const installDisputeLever = (app: Express): void => {
    app.post('/__test/payments/dispute', (request: Request, response: Response) => {
        const body = DISPUTE_BODY.safeParse(request.body ?? {});
        if (!body.success) {
            rejectResponse(response, 400, [z.prettifyError(body.error)]);
            return;
        }
        const wanted = body.data;

        paymentOf(wanted.orderId)
            .then((payment) => {
                if (!payment?.providerRef || !payment.currency) {
                    rejectResponse(response, 404, ['no payment with a provider reference']);
                    return undefined;
                }
                const now = Date.now();
                const delivery = setFakeDispute(payment.providerRef, {
                    disputeRef: wanted.disputeId,
                    kind: wanted.kind,
                    status: wanted.status,
                    reason: wanted.reason,
                    // A Decimal128 stringifies to its decimal.
                    amount: wanted.amount ?? Number(String(payment.amount)),
                    currency: payment.currency,
                    fundsWithdrawn: wanted.kind === 'chargeback' && wanted.status !== 'won',
                    evidenceDueBy: new Date(now + wanted.evidenceInDays * 86_400_000).toISOString(),
                    observedAt: new Date(now).toISOString(),
                    dashboardUrl: `https://dashboard.fake-psp.example/disputes/${wanted.disputeId}`
                });
                return paymentService
                    .applyWebhookDelivery(delivery, 'fake')
                    .then(() => response.status(204).end());
            })
            .catch((error: unknown) => {
                // Stryker disable next-line all
                logger.error({ message: 'dispute lever failed', error });
                rejectResponse(response, 500);
            });
    });
};

/**
 * Mount the payments levers. Called by `installModuleLevers`, from `installDemo`.
 * @param app - the application being assembled
 */
export const installLever = (app: Express): void => {
    installDisputeLever(app);
    app.post('/__test/payments/refund-failure', (request: Request, response: Response) => {
        const body = REFUND_FAILURE_BODY.safeParse(request.body ?? {});
        if (!body.success) {
            rejectResponse(response, 400, [z.prettifyError(body.error)]);
            return;
        }

        providerRefOf(body.data.orderId)
            .then((providerRef) => {
                if (!providerRef) {
                    rejectResponse(response, 404, ['no payment with a provider reference']);
                    return;
                }
                // `null` becomes `undefined`: that is how the double clears a failure.
                setFakeRefundFailure(providerRef, body.data.reason ?? undefined);
                response.status(204).end();
            })
            .catch((error: unknown) => {
                // Stryker disable next-line all
                logger.error({ message: 'refund-failure lever failed', error });
                rejectResponse(response, 500);
            });
    });
};
