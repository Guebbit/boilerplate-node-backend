/**
 * @module
 * The demo profile's payments lever: `POST /__test/payments/refund-failure`, which makes the fake
 * PSP refuse an order's refunds (or stop refusing).
 *
 * Its own file, beside `./fake`, because `payments` is a `group: shop` module and `demo:remove`
 * deletes the folder with it. `../levers.generated.ts` is rebuilt from the folders that remain, so
 * the demo's control surface (`../../demo.ts`) never names a module.
 */

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { RefundFailureReason } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { connection } from '@infrastructure/runtime/database';
import { setFakeRefundFailure } from './fake';

/**
 * The body of `POST /__test/payments/refund-failure`: the order, and the closed code every refund
 * on its payment should refuse with, or `null` to let refunds through again.
 */
const REFUND_FAILURE_BODY = z.object({
    orderId: z.string().refine((value) => ObjectId.isValid(value), 'not an order id'),
    reason: z.enum(RefundFailureReason).nullable()
});

/**
 * The provider's id for an order's payment, read straight from the collection: the wire shape
 * hides it, and the lever is the one caller that needs it.
 */
const providerRefOf = (orderId: string): Promise<string | undefined> =>
    connection
        .collection<{ providerRef?: string }>('payments')
        .findOne({ orderId: new ObjectId(orderId) })
        .then((payment) => payment?.providerRef);

/**
 * Mount the refund-failure lever. Called by `installModuleLevers`, from `installDemo`.
 * @param app - the application being assembled
 */
export const installLever = (app: Express): void => {
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
