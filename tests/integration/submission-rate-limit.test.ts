import express from 'express';
import supertest from 'supertest';

/**
 * `submissionLimiter` — the budget for `POST /feedback/contact` — spends on a SUCCESSFUL request,
 * the opposite of `credentialLimiters`' `skipSuccessfulRequests`. This is the regression test for
 * `FEEDBACK_PLAN.md` correction 1: mounting `credentialLimiters` on `/contact` would count zero of
 * the requests that matter, because every abusive contact-form submission gets a `201`.
 *
 * Lives here rather than in the unit suite because it sends a real request through
 * `express-rate-limit`'s middleware — `tests/unit/infrastructure/http/middlewares/rate-limit.test.ts`
 * covers the pure-configuration properties (the default, and its relation to the global budget).
 */

/**
 * Reloads `submissionLimiter` with `NODE_SUBMISSION_RATE_LIMIT_MAX` set to `limit`, restoring the
 * environment variable immediately after — the same recipe `auth-hardening.test.ts` uses for
 * `credentialLimiters`, needed because the limit is captured at import time.
 */
const submissionLimiterWithBudget = async (limit: number) => {
    const original = process.env.NODE_SUBMISSION_RATE_LIMIT_MAX;
    process.env.NODE_SUBMISSION_RATE_LIMIT_MAX = String(limit);
    jest.resetModules();

    const { submissionLimiter } = await import('@infrastructure/http/middlewares/rate-limit');

    if (original === undefined) delete process.env.NODE_SUBMISSION_RATE_LIMIT_MAX;
    else process.env.NODE_SUBMISSION_RATE_LIMIT_MAX = original;

    return submissionLimiter;
};

describe('submissionLimiter', () => {
    afterEach(() => jest.resetModules());

    it('spends the budget on a SUCCESSFUL request, unlike the credential budgets', async () => {
        const submissionLimiter = await submissionLimiterWithBudget(3);

        const limited = express();
        limited.post('/contact', submissionLimiter, (_request, response) => {
            response.status(201).json({ success: true });
        });

        const statuses: number[] = [];
        for (let index = 0; index < 5; index++) {
            const response = await supertest(limited).post('/contact');
            statuses.push(response.status);
        }

        expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
        expect(statuses.slice(3)).toEqual([429, 429]);
    });

    it('also spends the budget on a FAILED request — every request counts, not just successes', async () => {
        const submissionLimiter = await submissionLimiterWithBudget(3);

        const limited = express();
        limited.post('/contact', submissionLimiter, (_request, response) => {
            response.status(422).json({ success: false });
        });

        const statuses: number[] = [];
        for (let index = 0; index < 5; index++) {
            const response = await supertest(limited).post('/contact');
            statuses.push(response.status);
        }

        expect(statuses.slice(0, 3)).toEqual([422, 422, 422]);
        expect(statuses.slice(3)).toEqual([429, 429]);
    });
});
