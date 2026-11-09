import express from 'express';
import supertest from 'supertest';
import { postPaymentWebhook } from '@modules/payments/controllers/post-payment-webhook';
import { logger } from '@infrastructure/adapters/logger';
import { attachLocale } from '@infrastructure/http/middlewares/locale';

/**
 * A bodyless payment webhook is the caller's mistake: 400, and no error-level log. The
 * "parser ordering changed" error is kept for the real invariant break, a body that WAS sent
 * while no raw body reached the controller. Built on a small app so the raw-body hook can be
 * left out for the second case, which the real app never does.
 */

/** The controller behind the raw-body hook the real app installs, or without it. */
const webhookApp = (withRawBodyHook: boolean) => {
    const app = express();
    if (withRawBodyHook)
        app.use(
            express.json({
                verify: (request, _response, buffer) => {
                    (request as express.Request).rawBody = Buffer.from(buffer);
                }
            })
        );
    app.use(attachLocale);
    app.post('/payments/webhook/:provider', postPaymentWebhook);
    return supertest(app);
};

describe('POST /payments/webhook/:provider without a body', () => {
    let errorLog: jest.SpyInstance;

    beforeEach(() => {
        errorLog = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    });

    afterEach(() => {
        errorLog.mockRestore();
    });

    it('answers 400 and logs no error for a bare POST', async () => {
        const response = await webhookApp(true).post('/payments/webhook/fake');

        expect(response.status).toBe(400);
        expect(errorLog).not.toHaveBeenCalled();
    });

    it('answers 400 and logs no error for a Content-Type-only POST', async () => {
        const response = await webhookApp(true)
            .post('/payments/webhook/fake')
            .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(errorLog).not.toHaveBeenCalled();
    });

    it('still logs the parser-ordering error when a body was sent but no raw body arrived', async () => {
        const response = await webhookApp(false)
            .post('/payments/webhook/fake')
            .set('Content-Type', 'application/json')
            .send({ id: 'evt_1' });

        expect(response.status).toBe(400);
        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('parser ordering') })
        );
    });
});
