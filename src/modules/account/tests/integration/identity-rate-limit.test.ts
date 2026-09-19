import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { withEnvironmentOverrides } from '@tests/environment';
import { appAnswering, statusOf } from '@tests/rate-limit-harness';

/**
 * Anti-automation Rung 1 (see `docs/tools/security.md#identity--and-block-keyed-budgets--signup-password-reset-the-contact-form`):
 * `signupLimiters` and `resetRequestLimiters` each add an identity (submitted email) and an
 * address-BLOCK (IPv4 /24, IPv6 /64) dimension on top of the per-address budget — three keys, not
 * one. Built against trivial handlers, like `submissionLimiter`'s own tests — the property under
 * test belongs to the limiter, not to `postSignup`/`postResetRequest`. `feedback`'s own identity
 * budget (`contactLimiters`) has the same shape and its own test —
 * `src/modules/feedback/tests/integration/contact-identity-rate-limit.test.ts`.
 */

/** Reloads `@modules/account/rate-limits` with the given env vars set — every limiter's budget is
 * captured at import time, so a smaller value only takes effect on a fresh module instance. */
const withAccountRateLimits = <T>(
    overrides: Record<string, string>,
    pick: (rateLimitsModule: typeof import('@modules/account/rate-limits')) => T
): Promise<T> =>
    withEnvironmentOverrides(overrides, () => {
        jest.resetModules();
        return import('@modules/account/rate-limits').then(pick);
    });

describe('signupLimiters', () => {
    afterEach(() => jest.resetModules());

    it('spends the identity budget on a SUCCESSFUL signup, unlike credentialLimiters', async () => {
        const signupLimiters = await withAccountRateLimits(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '2',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, true, ...signupLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('sybil@example.com'))).toBe(201);
        expect(await statusOf(attempt('sybil@example.com'))).toBe(201);
        expect(await statusOf(attempt('sybil@example.com'))).toBe(429);

        // A different mailbox still has its own identity budget, from the same address.
        expect(await statusOf(attempt('real@example.com'))).toBe(201);
    });

    it('spends the address budget across different emails from the same caller', async () => {
        const signupLimiters = await withAccountRateLimits(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '2',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, true, ...signupLimiters);
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
        const resetRequestLimiters = await withAccountRateLimits(
            {
                NODE_RESET_RATE_LIMIT_MAX: '2',
                NODE_RESET_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_RESET_RATE_LIMIT_BLOCK_MAX: '50'
            },
            (module) => module.resetRequestLimiters
        );

        const app = appAnswering(200, true, ...resetRequestLimiters);
        const attempt = (email: string) => supertest(app).post('/route').send({ email });

        expect(await statusOf(attempt('victim@example.com'))).toBe(200);
        expect(await statusOf(attempt('victim@example.com'))).toBe(200);
        expect(await statusOf(attempt('victim@example.com'))).toBe(429);
    });
});

describe('address-block keying', () => {
    afterEach(() => jest.resetModules());

    it('shares one budget across different IPv4 addresses in the same /24', async () => {
        const signupLimiters = await withAccountRateLimits(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '2'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, true, ...signupLimiters);
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
        const signupLimiters = await withAccountRateLimits(
            {
                NODE_SIGNUP_RATE_LIMIT_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX: '50',
                NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX: '2'
            },
            (module) => module.signupLimiters
        );

        const app = appAnswering(201, true, ...signupLimiters);
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

describe('mfaChallengeLimiter', () => {
    afterEach(() => jest.resetModules());

    it('refuses the 6th guess against one live challenge', async () => {
        const mfaChallengeLimiter = await withAccountRateLimits(
            { NODE_MFA_CHALLENGE_MAX: '5' },
            (module) => module.mfaChallengeLimiter
        );

        const app = appAnswering(200, true, mfaChallengeLimiter);
        const guess = () => supertest(app).post('/route').send({ challenge: 'same-challenge' });

        for (let attempt = 0; attempt < 5; attempt++) expect(await statusOf(guess())).toBe(200);
        expect(await statusOf(guess())).toBe(429);
    });

    it('does not let two callers with no challenge exhaust the same bucket', async () => {
        // A request naming no `challenge` must key on the caller's address BLOCK, not one shared
        // key — a shared key would let any two such callers spend the same budget. See
        // `challengeKey` in `account/rate-limits.ts`.
        const mfaChallengeLimiter = await withAccountRateLimits(
            { NODE_MFA_CHALLENGE_MAX: '1' },
            (module) => module.mfaChallengeLimiter
        );

        const app = appAnswering(200, true, mfaChallengeLimiter);
        const guessFrom = (ip: string) =>
            supertest(app).post('/route').set('X-Forwarded-For', ip).send({});

        expect(await statusOf(guessFrom('203.0.113.5'))).toBe(200);
        // Same block, no challenge either — spends the block bucket the first call already used.
        expect(await statusOf(guessFrom('203.0.113.9'))).toBe(429);
        // A different block entirely has its own, untouched budget.
        expect(await statusOf(guessFrom('198.51.100.5'))).toBe(200);
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
});
