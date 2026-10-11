import express from 'express';
import supertest from 'supertest';
import { asStub } from '@tests/stub';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import type { Request, RequestHandler } from 'express';
import type { AuthContext } from '@types';

/**
 * Two budgets keyed alike on one request are two counters, not one hit counted twice.
 *
 * `POST /payments/:id/confirm` mounts the attempt and the decline budgets, both keyed on the
 * account. With the limits Redis configured, `express-rate-limit` tells stores apart by their
 * `prefix`; a store without one made the pair read as `ERR_ERL_DOUBLE_COUNT`. The Redis here is
 * unreachable on purpose: the counters fall back to memory, but the store wrappers are the same
 * ones a working Redis runs behind.
 */

/** Stands in for `getAuth` resolving one account — only `.id` is read by `accountIdOf`. */
const asAccount = (id: string): RequestHandler => {
    return (request: Request, _response, next) => {
        request.authContext = asStub<AuthContext>({ id });
        next();
    };
};

describe('payment budgets keyed on the same account, counted through a Redis-backed store', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('are not reported as one hit counted twice on POST /payments/:id/confirm', async () => {
        const reported: string[] = [];
        const { attempt, decline } = await withReloadedRateLimits(
            async () => {
                const { logger } = await import('@infrastructure/adapters/logger');
                jest.spyOn(logger, 'error').mockImplementation((...problems: unknown[]) => {
                    for (const problem of problems)
                        if (problem instanceof Error)
                            reported.push((problem as { code?: string }).code ?? problem.message);
                });
                return import('@modules/payments/rate-limits');
            },
            { NODE_RATE_LIMIT_REDIS_URL: 'redis://127.0.0.1:1' },
            (limits) => ({
                attempt: limits.paymentConfirmAttemptLimiter,
                decline: limits.paymentConfirmDeclineLimiter
            })
        );

        const app = express();
        app.use(asAccount('account-1'));
        app.post('/confirm', attempt, decline, (_request, response) => {
            response.status(200).json({ success: true });
        });
        await supertest(app).post('/confirm').expect(200);

        expect(reported).not.toContain('ERR_ERL_DOUBLE_COUNT');
    });
});
