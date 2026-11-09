import express from 'express';
import supertest from 'supertest';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import { postPaymentWebhook } from '@modules/payments/controllers/post-payment-webhook';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@modules/payments/providers';
import { registerPaymentProvider } from '@modules/payments/providers/registry';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import { attachLocale } from '@infrastructure/http/middlewares/locale';

/**
 * The payment webhook's budget over real HTTP: only refused deliveries spend it, per address
 * block, and a refusal writes no audit row. Built from the real limiter and the real controller on
 * a small app, because the property is the limiter's and the controller's, not routing's. A
 * delivery naming no intent applies nothing, so no database is needed.
 */

/** Cap low enough to cross in a few requests. */
const CAP = 3;

/**
 * The real limiter, loaded fresh after the cap is set (`rateLimit()` reads it once), in front of the
 * real controller. The controller and i18n stay on the original module registry: i18next is booted
 * there, and a reset would leave `t()` with no dictionaries. The audit logger is read from the
 * fresh registry because that is the one the limiter's refusals write to.
 */
const loadWebhook = () =>
    withReloadedRateLimits(
        () => import('@modules/payments/rate-limits'),
        { NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX: String(CAP) },
        (limits) => limits.webhookLimiter
    ).then(async (webhookLimiter) => {
        const { auditLogger } = await import('@infrastructure/adapters/logger');
        registerPaymentProvider(fakePaymentProvider);

        const app = express();
        // One proxy hop: `X-Forwarded-For` becomes `request.ip`, as in the real app.
        app.set('trust proxy', 1);
        app.use(
            express.json({
                verify: (request, _response, buffer) => {
                    (request as express.Request).rawBody = Buffer.from(buffer);
                }
            })
        );
        // The controller's refusal copy is translated, which needs the locale the real app attaches.
        app.use(attachLocale);
        app.post('/payments/webhook/:provider', webhookLimiter, postPaymentWebhook);
        return { app, auditLogger };
    });

/** One delivery from `address`, signed or forged. */
const deliver = (
    loaded: Awaited<ReturnType<typeof loadWebhook>>,
    address: string,
    signed: boolean
) => {
    const body = JSON.stringify({ id: 'evt_limit' });
    return supertest(loaded.app)
        .post('/payments/webhook/fake')
        .set('Content-Type', 'application/json')
        .set('X-Forwarded-For', address)
        .set(WEBHOOK_SIGNATURE_HEADER, signed ? signWebhookPayload(body) : 't=1,v1=forged')
        .send(body);
};

/** `count` different addresses inside one /24. */
const inOneBlock = (count: number) =>
    Array.from({ length: count }, (_, index) => `203.0.113.${String(index + 1)}`);

/** The statuses of one delivery per address, in order (sequential: the budget is order-sensitive). */
const statusesOf = async (
    loaded: Awaited<ReturnType<typeof loadWebhook>>,
    addresses: string[],
    signed: boolean
) => {
    const statuses: number[] = [];
    for (const address of addresses) {
        const response = await deliver(loaded, address, signed);
        statuses.push(response.status);
    }
    return statuses;
};

describe('the payment webhook budget', () => {
    afterEach(() => jest.restoreAllMocks());
    afterAll(() => jest.resetModules());

    it('refuses forgeries rotating addresses inside one /24 once the block has spent it', async () => {
        const loaded = await loadWebhook();
        const statuses = await statusesOf(loaded, inOneBlock(CAP + 2), false);

        expect(statuses).toEqual([400, 400, 400, 429, 429]);
    });

    it('writes no audit row for those refusals', async () => {
        const loaded = await loadWebhook();
        const spy = jest
            .spyOn(loaded.auditLogger, 'log')
            .mockImplementation(() => loaded.auditLogger);

        const statuses = await statusesOf(loaded, inOneBlock(CAP + 1), false);

        // The refusal happened, and the audit logger the limiter writes to heard nothing of it.
        expect(statuses.at(-1)).toBe(429);
        expect(spy).not.toHaveBeenCalled();
    });

    it('keeps answering signed deliveries past the cap', async () => {
        const loaded = await loadWebhook();
        const statuses = await statusesOf(
            loaded,
            Array.from({ length: CAP + 2 }, () => '198.51.100.7'),
            true
        );

        expect(statuses).toEqual(Array.from({ length: CAP + 2 }, () => 204));
    });

    it('does not let another block share the spent budget', async () => {
        const loaded = await loadWebhook();
        await statusesOf(loaded, inOneBlock(CAP), false);

        const elsewhere = await deliver(loaded, '198.51.100.9', false);

        expect(elsewhere.status).toBe(400);
    });
});
