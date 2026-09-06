import express from 'express';
import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';

/**
 * Anti-automation Rung 1 (see `docs/tools/security.md#identity--and-block-keyed-budgets--signup-password-reset-the-contact-form`):
 * `signupLimiters`, `resetRequestLimiters` and `contactLimiters` each add an identity (submitted
 * email) and an address-BLOCK (IPv4 /24, IPv6 /64) dimension to what used to be a single
 * per-address budget. Built against trivial handlers, like `submissionLimiter`'s own tests — the
 * property under test belongs to the limiter, not to `postSignup`/`postResetRequest`.
 */

/**
 * Reloads `@infrastructure/http/middlewares/rate-limit` with the given env vars set, restoring
 * them immediately after — every limiter's budget is captured at import time, so a smaller value
 * only takes effect on a fresh module instance. Shared by every case below rather than repeated,
 * since only which env vars and which export differs.
 */
const withRateLimitModule = async <T>(
    overrides: Record<string, string>,
    pick: (rateLimitModule: typeof import('@infrastructure/http/middlewares/rate-limit')) => T
): Promise<T> => {
    const originals: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(overrides)) {
        originals[key] = process.env[key];
        process.env[key] = value;
    }
    jest.resetModules();

    const rateLimitModule = await import('@infrastructure/http/middlewares/rate-limit');
    const picked = pick(rateLimitModule);

    for (const [key, original] of Object.entries(originals)) {
        if (original === undefined) delete process.env[key];
        else process.env[key] = original;
    }

    return picked;
};

/** A trivial app that always answers `status`, past the given limiter chain. */
const appAnswering = (status: number, ...limiters: express.RequestHandler[]) => {
    const app = express();
    // Trusts one hop so `X-Forwarded-For`, set explicitly below, becomes `request.ip` — the same
    // mechanism `NODE_TRUST_PROXY_HOPS` configures in the real app. See
    // docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong.
    app.set('trust proxy', 1);
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

describe('signupLimiters', () => {
    afterEach(() => jest.resetModules());

    it('spends the identity budget on a SUCCESSFUL signup, unlike credentialLimiters', async () => {
        const signupLimiters = await withRateLimitModule(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '2',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, ...signupLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('sybil@example.com'))).toBe(201);
        expect(await statusOf(attempt('sybil@example.com'))).toBe(201);
        expect(await statusOf(attempt('sybil@example.com'))).toBe(429);

        // A different mailbox still has its own identity budget, from the same address.
        expect(await statusOf(attempt('real@example.com'))).toBe(201);
    });

    it('spends the address budget across different emails from the same caller', async () => {
        const signupLimiters = await withRateLimitModule(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '2',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, ...signupLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('one@example.com'))).toBe(201);
        expect(await statusOf(attempt('two@example.com'))).toBe(201);
        // A third distinct mailbox from the same address is what the address budget bounds.
        expect(await statusOf(attempt('three@example.com'))).toBe(429);
    });
});

describe('resetRequestLimiters', () => {
    afterEach(() => jest.resetModules());

    it('spends the identity budget on the 200 postResetRequest always answers', async () => {
        // Standing in for `postResetRequest`'s indistinguishable-response design: every attempt,
        // real account or not, gets the same status, so the limiter must count every one.
        const resetRequestLimiters = await withRateLimitModule(
            {
                NODE_RESET_RATE_LIMIT_MAX: '2',
                NODE_RESET_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_RESET_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.resetRequestLimiters
        );

        const app = appAnswering(200, ...resetRequestLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('victim@example.com'))).toBe(200);
        expect(await statusOf(attempt('victim@example.com'))).toBe(200);
        expect(await statusOf(attempt('victim@example.com'))).toBe(429);
    });
});

describe('contactLimiters', () => {
    afterEach(() => jest.resetModules());

    it('adds an identity budget the address-only submissionLimiter never had', async () => {
        const contactLimiters = await withRateLimitModule(
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

describe('address-block keying', () => {
    afterEach(() => jest.resetModules());

    it('shares one budget across different IPv4 addresses in the same /24', async () => {
        const signupLimiters = await withRateLimitModule(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '2'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, ...signupLimiters);
        const attempt = (ip: string, email: string) =>
            supertest(app).post('/route').set('X-Forwarded-For', ip).send({ email });

        expect(await statusOf(attempt('203.0.113.5', 'one@example.com'))).toBe(201);
        expect(await statusOf(attempt('203.0.113.9', 'two@example.com'))).toBe(201);
        // A third address, still 203.0.113.0/24, spends the same block budget.
        expect(await statusOf(attempt('203.0.113.20', 'three@example.com'))).toBe(429);

        // A different /24 entirely is a different block, with its own budget.
        expect(await statusOf(attempt('198.51.100.5', 'four@example.com'))).toBe(201);
    });

    it('shares one budget across different IPv6 addresses in the same /64', async () => {
        const signupLimiters = await withRateLimitModule(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '2'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, ...signupLimiters);
        const attempt = (ip: string, email: string) =>
            supertest(app).post('/route').set('X-Forwarded-For', ip).send({ email });

        expect(await statusOf(attempt('2001:db8::1', 'one@example.com'))).toBe(201);
        expect(await statusOf(attempt('2001:db8::2', 'two@example.com'))).toBe(201);
        // Same 2001:db8::/64 as the two above.
        expect(await statusOf(attempt('2001:db8::3', 'three@example.com'))).toBe(429);

        // A different /64 — the 4th hextet changes — is a different block.
        expect(await statusOf(attempt('2001:db8:0:1::1', 'four@example.com'))).toBe(201);
    });
});

describe('mounted on the real routes', () => {
    setupTestDb();

    /*
     * `ratelimit` (draft-7) headers are the limiter's fingerprint, same as
     * `auth-hardening.test.ts`'s login case — present means the array actually reached the route,
     * not just that the module compiles.
     */
    it('signupLimiters is mounted on POST /account/signup', async () => {
        const response = await api().post('/account/signup').send({
            email: 'mounted-signup@example.com',
            username: 'mountedsignup',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.headers).toHaveProperty('ratelimit');
    });

    it('resetRequestLimiters is mounted on POST /account/reset', async () => {
        const user = await createUser();

        const response = await api().post('/account/reset').send({ email: user.email });

        expect(response.headers).toHaveProperty('ratelimit');
    });

    it('contactLimiters is mounted on POST /feedback/contact', async () => {
        const response = await api().post('/feedback/contact').send({
            email: 'mounted-contact@example.com',
            subject: 'Hello',
            message: 'Just checking the limiter is wired up.'
        });

        expect(response.headers).toHaveProperty('ratelimit');
    });
});
