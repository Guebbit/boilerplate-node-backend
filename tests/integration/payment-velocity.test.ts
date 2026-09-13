import express from 'express';
import supertest from 'supertest';
import { asStub } from '@tests/stub';
import type { Request, RequestHandler } from 'express';
import type { AuthContext } from '@types';

/**
 * The card-testing velocity budgets on `POST /payments/:id/confirm`: attempts, declines, and the
 * challenge gate between them. Built against trivial handlers rather than `postPaymentConfirm` —
 * the property under test belongs to the limiters, and routing it through a real payment would
 * only add a database round trip to every attempt. `payments/tests/unit/routes.test.ts` already
 * asserts the real route mounts all three in the documented order.
 */

/** Stands in for `getAuth` resolving one account — only `.id` is read by `accountIdOf`. */
const asAccount = (id: string): RequestHandler => {
    return (request: Request, _response, next) => {
        request.authContext = asStub<AuthContext>({ id });
        next();
    };
};

/** A route that declines/succeeds/errors on request, setting the field the limiter reads. */
const declineAwareApp = (declineLimiter: RequestHandler) => {
    const app = express();
    app.use(express.json());
    app.use(asAccount('account-1'));
    app.post('/confirm', declineLimiter, (request: Request, response) => {
        const outcome = (request.body as { outcome?: string }).outcome ?? 'declined';
        request.paymentConfirmDeclined = outcome === 'declined';
        if (outcome === 'declined')
            response.status(409).json({ errors: [{ code: 'PAYMENT_DECLINED' }] });
        else if (outcome === 'order-lost')
            response.status(409).json({ errors: [{ code: 'PAYMENT_ORDER_NOT_PAYABLE' }] });
        else response.status(200).json({ success: true });
    });
    return app;
};

/**
 * Freshly-constructed limiters with a small budget on each half.
 *
 * `rateLimit()` reads its options once, at construction — same recipe as
 * `auth-hardening.test.ts#limitersWithBudget` — so the module has to be re-evaluated for a
 * different budget to take effect.
 */
const limitersWithBudget = async (attemptLimit: number, declineLimit = attemptLimit) => {
    const originals = {
        attempt: process.env.NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX,
        decline: process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX
    };
    process.env.NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX = String(attemptLimit);
    process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX = String(declineLimit);
    jest.resetModules();

    const rateLimit = await import('@infrastructure/http/middlewares/rate-limit');

    for (const [name, value] of [
        ['NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX', originals.attempt],
        ['NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX', originals.decline]
    ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }

    return rateLimit;
};

describe('payment-velocity: the confirm-attempt budget', () => {
    afterEach(() => jest.resetModules());

    it('rejects further attempts with 429 once the budget is spent, even on success', async () => {
        const { paymentConfirmAttemptLimiter } = await limitersWithBudget(3);

        const app = express();
        app.use(asAccount('account-1'));
        app.post('/confirm', paymentConfirmAttemptLimiter, (_request, response) => {
            // Counts EVERY outcome, unlike the credential budgets — a card can be swapped and
            // retried on the same intent, so success must spend the budget too.
            response.status(200).json({ success: true });
        });

        const statuses: number[] = [];
        for (let index = 0; index < 5; index++) {
            const response = await supertest(app).post('/confirm');
            statuses.push(response.status);
        }

        expect(statuses).toEqual([200, 200, 200, 429, 429]);
    });

    it('budgets one account separately from another', async () => {
        const { paymentConfirmAttemptLimiter } = await limitersWithBudget(2);

        const app = express();
        app.use((request, response, next) => {
            const accountId = request.header('x-account') ?? 'anonymous';
            asAccount(accountId)(request, response, next);
        });
        app.post('/confirm', paymentConfirmAttemptLimiter, (_request, response) => {
            response.status(200).json({ success: true });
        });

        const attempt = (accountId: string) =>
            supertest(app).post('/confirm').set('x-account', accountId);

        await attempt('one');
        await attempt('one');
        const spent = await attempt('one');
        expect(spent.status).toBe(429);
        // A different account still has its own, unaffected by the first's spend.
        const other = await attempt('two');
        expect(other.status).toBe(200);
    });
});

describe('payment-velocity: the decline budget', () => {
    afterEach(() => jest.resetModules());

    it('spends the budget on a genuine decline', async () => {
        const { paymentConfirmDeclineLimiter } = await limitersWithBudget(1000, 3);
        const app = declineAwareApp(paymentConfirmDeclineLimiter);
        const decline = () => supertest(app).post('/confirm').send({ outcome: 'declined' });

        for (let index = 0; index < 3; index++) {
            const response = await decline();
            expect(response.status).toBe(409);
        }
        // The fourth decline is refused before it reaches the controller.
        const spent = await decline();
        expect(spent.status).toBe(429);
    });

    it("does not spend the budget on the route's OTHER 409, a lost-order race", async () => {
        const { paymentConfirmDeclineLimiter } = await limitersWithBudget(1000, 1);
        const app = declineAwareApp(paymentConfirmDeclineLimiter);
        const orderLost = () => supertest(app).post('/confirm').send({ outcome: 'order-lost' });

        // A budget of ONE would already be exhausted here if this 409 spent it too.
        for (let index = 0; index < 5; index++) {
            const response = await orderLost();
            expect(response.status).toBe(409);
        }
    });

    it('does not spend the budget on a success', async () => {
        const { paymentConfirmDeclineLimiter } = await limitersWithBudget(1000, 1);
        const app = declineAwareApp(paymentConfirmDeclineLimiter);
        const succeed = () => supertest(app).post('/confirm').send({ outcome: 'succeeded' });

        for (let index = 0; index < 5; index++) {
            const response = await succeed();
            expect(response.status).toBe(200);
        }
    });
});

describe('paymentDeclineChallengeGate — rung 3 only once the account has a decline on record', () => {
    const ORIGINAL_PROVIDER = process.env.NODE_ANTIBOT_PROVIDER;

    afterEach(() => {
        jest.resetModules();
        if (ORIGINAL_PROVIDER === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
        else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL_PROVIDER;
    });

    /**
     * Same `jest.resetModules()` recipe `limitersWithBudget` uses: the decline limiter and the
     * gate must come from the SAME module instance, since the gate reads the property name the
     * decline limiter was configured with.
     */
    const appWithBudget = async (declineLimit: number) => {
        const original = process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX;
        process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX = String(declineLimit);
        jest.resetModules();

        const { paymentConfirmDeclineLimiter, paymentDeclineChallengeGate } =
            await import('@infrastructure/http/middlewares/rate-limit');

        if (original === undefined) delete process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX;
        else process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX = original;

        const app = express();
        app.use(express.json());
        app.use(asAccount('account-1'));
        app.post(
            '/confirm',
            paymentConfirmDeclineLimiter,
            paymentDeclineChallengeGate,
            (request: Request, response: express.Response) => {
                request.paymentConfirmDeclined = true;
                response.status(409).json({ errors: [{ code: 'PAYMENT_DECLINED' }] });
            }
        );
        return app;
    };

    it('never engages while no provider is selected, decline or not', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;
        const app = await appWithBudget(10);
        const attempt = () => supertest(app).post('/confirm').send({});

        for (let index = 0; index < 2; index++) {
            const response = await attempt();
            expect(response.status).toBe(409);
        }
    });

    it('passes the first, honest attempt through untouched once a provider is selected', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        const app = await appWithBudget(10);

        const response = await supertest(app).post('/confirm').send({});

        // The confirm handler still answers its own 409 — no challenge demanding a token nobody
        // was asked to send yet, on an account with no prior decline.
        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('PAYMENT_DECLINED');
    });

    it('challenges once the account already has a decline on record', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        const app = await appWithBudget(10);
        const attempt = () => supertest(app).post('/confirm').send({});

        await attempt(); // first decline: no prior decline yet, stays honest

        const response = await attempt(); // second attempt: one prior decline on record

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('ANTIBOT_VERIFICATION_FAILED');
    });
});
