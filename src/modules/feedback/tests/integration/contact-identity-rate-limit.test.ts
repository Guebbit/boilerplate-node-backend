import express from 'express';
import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

/**
 * Anti-automation Rung 1 (see `docs/tools/security.md#identity--and-block-keyed-budgets--signup-password-reset-the-contact-form`):
 * `contactLimiters` adds an identity (submitted email) dimension on top of `submissionLimiter`'s
 * per-address budget — the address-only case already lives in
 * `submission-rate-limit.test.ts`. Built against a trivial handler — the property under test
 * belongs to the limiter, not to the contact controller. `account`'s own identity budgets
 * (`signupLimiters`, `resetRequestLimiters`) have the same shape and their own test —
 * `src/modules/account/tests/integration/identity-rate-limit.test.ts`.
 */

/**
 * Sets the given env vars, runs `load`, restores them immediately after — every limiter's budget
 * is captured at import time, so a smaller value only takes effect on a fresh module instance.
 */
const withOverrides = async <T>(
    overrides: Record<string, string>,
    load: () => Promise<T>
): Promise<T> => {
    const originals: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(overrides)) {
        originals[key] = process.env[key];
        process.env[key] = value;
    }
    jest.resetModules();

    const picked = await load();

    for (const [key, original] of Object.entries(originals)) {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
    }

    return picked;
};

/** Reloads `@modules/feedback/rate-limits` with the given env vars set — see {@link withOverrides}. */
const withFeedbackRateLimits = <T>(
    overrides: Record<string, string>,
    pick: (rateLimitsModule: typeof import('@modules/feedback/rate-limits')) => T
): Promise<T> => withOverrides(overrides, () => import('@modules/feedback/rate-limits').then(pick));

/** A trivial app that always answers `status`, past the given limiter chain. */
const appAnswering = (status: number, ...limiters: express.RequestHandler[]) => {
    const app = express();
    app.use(express.json());
    app.post('/route', ...limiters, (_request, response) => {
        response.status(status).json({});
    });
    return app;
};

/** The response status of a pending supertest request, without accessing it on the await itself. */
const statusOf = async (pending: supertest.Test): Promise<number> => {
    const response = await pending;
    return response.status;
};

describe('contactLimiters', () => {
    afterEach(() => jest.resetModules());

    it('adds an identity budget the address-only submissionLimiter never had', async () => {
        const contactLimiters = await withFeedbackRateLimits(
            {
                NODE_SUBMISSION_RATE_LIMIT_MAX: '50',
                NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX: '2',
                NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.contactLimiters
        );

        const app = appAnswering(201, ...contactLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('spammer@example.com'))).toBe(201);
        expect(await statusOf(attempt('spammer@example.com'))).toBe(201);
        expect(await statusOf(attempt('spammer@example.com'))).toBe(429);

        // A different sender, from the same address, still has room.
        expect(await statusOf(attempt('other@example.com'))).toBe(201);
    });
});

describe('mounted on the real routes', () => {
    setupTestDb();

    /*
     * `ratelimit` (draft-7) headers are the limiter's fingerprint, same as
     * `auth-hardening.test.ts`'s login case — present means the array actually reached the route,
     * not just that the module compiles.
     */
    it('contactLimiters is mounted on POST /feedback/contact', async () => {
        const response = await api().post('/feedback/contact').send({
            email: 'mounted-contact@example.com',
            subject: 'Hello',
            message: 'Just checking the limiter is wired up.'
        });

        expect(response.headers).toHaveProperty('ratelimit');
    });
});
