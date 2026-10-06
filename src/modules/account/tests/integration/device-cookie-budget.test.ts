/**
 * @module
 * The per-account login budget and the familiar-device cookie that keeps it from being a lock-out
 * lever: a browser the account signed in from before skips the budget an attacker spent, a forged
 * cookie gets its own small one, and a repeated lockout lasts longer. Built against trivial
 * handlers like the other limiter suites (the property belongs to the limiter), plus one pass over
 * the real login route for the cookie's issue.
 */

import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { setCookie } from '@tests/cookies';
import { appAnswering, statusOf, withReloadedRateLimits } from '@tests/rate-limit-harness';

setupTestDb();

/** {@link withReloadedRateLimits} bound to this module's limiters. */
const withAccountRateLimits = <T>(
    overrides: Record<string, string>,
    pick: (rateLimitsModule: typeof import('@modules/account/rate-limits')) => T
): Promise<T> =>
    withReloadedRateLimits(() => import('@modules/account/rate-limits'), overrides, pick);

/** A cap of two per account, the other budgets out of the way. */
const SMALL_ACCOUNT_BUDGET = {
    NODE_AUTH_RATE_LIMIT_MAX: '2',
    NODE_AUTH_RATE_LIMIT_ADDRESS_MAX: '500',
    NODE_AUTH_RATE_LIMIT_BLOCK_MAX: '500',
    NODE_AUTH_RATE_LIMIT_DEVICE_MAX: '500'
};

/** A wrong-password attempt at `email`, carrying `cookie` when given. */
const guess = (app: ReturnType<typeof appAnswering>, email: string, cookie?: string) => {
    const request = supertest(app).post('/route').send({ email });
    return cookie ? request.set('Cookie', cookie) : request;
};

/** Log in for real and answer the `device` cookie the response set, as a `Cookie` header. */
const deviceCookieAfterLogin = async (email: string): Promise<string> => {
    const response = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    const header = setCookie(response, 'device');
    if (!header) throw new Error('login set no device cookie');
    return header.split(';', 1)[0];
};

describe('the device cookie, as issued', () => {
    it('is set by a successful login, and not by a failed one', async () => {
        const user = await createUser({ email: 'owner@example.com' });

        const failed = await api()
            .post('/account/login')
            .send({ email: user.email, password: 'not-the-password' });
        const succeeded = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        expect(setCookie(failed, 'device')).toBeUndefined();
        expect(setCookie(succeeded, 'device')).toMatch(/HttpOnly/i);
    });
});

describe('the per-account credential budget', () => {
    afterEach(() => jest.resetModules());

    it('locks a stranger out after the cap, and 429s without the cookie', async () => {
        const limiters = await withAccountRateLimits(
            SMALL_ACCOUNT_BUDGET,
            (module) => module.credentialLimiters
        );
        const app = appAnswering(401, true, ...limiters);

        expect(await statusOf(guess(app, 'owner@example.com'))).toBe(401);
        expect(await statusOf(guess(app, 'owner@example.com'))).toBe(401);
        expect(await statusOf(guess(app, 'owner@example.com'))).toBe(429);
    });

    it('lets the owner’s browser in while the budget is exhausted', async () => {
        await createUser({ email: 'owner@example.com' });
        const cookie = await deviceCookieAfterLogin('owner@example.com');
        const limiters = await withAccountRateLimits(
            SMALL_ACCOUNT_BUDGET,
            (module) => module.credentialLimiters
        );
        const app = appAnswering(401, true, ...limiters);
        for (let attempt = 0; attempt < 3; attempt++)
            await statusOf(guess(app, 'owner@example.com'));
        expect(await statusOf(guess(app, 'owner@example.com'))).toBe(429);

        // The same account, from the browser that signed in before: not refused.
        expect(await statusOf(guess(app, 'owner@example.com', cookie))).toBe(401);
    });

    it('does not extend one account’s cookie to another', async () => {
        await createUser({ email: 'owner@example.com' });
        const cookie = await deviceCookieAfterLogin('owner@example.com');
        const limiters = await withAccountRateLimits(
            SMALL_ACCOUNT_BUDGET,
            (module) => module.credentialLimiters
        );
        const app = appAnswering(401, true, ...limiters);

        for (let attempt = 0; attempt < 3; attempt++)
            await statusOf(guess(app, 'victim@example.com', cookie));

        expect(await statusOf(guess(app, 'victim@example.com', cookie))).toBe(429);
    });

    it('gives a forged cookie its own, small budget', async () => {
        const limiters = await withAccountRateLimits(
            {
                ...SMALL_ACCOUNT_BUDGET,
                NODE_AUTH_RATE_LIMIT_MAX: '500',
                NODE_AUTH_RATE_LIMIT_DEVICE_MAX: '2'
            },
            (module) => module.credentialLimiters
        );
        const app = appAnswering(401, true, ...limiters);

        // The account budget is nowhere near spent: only the forged-cookie budget can answer 429.
        expect(await statusOf(guess(app, 'a@example.com', 'device=forged'))).toBe(401);
        expect(await statusOf(guess(app, 'b@example.com', 'device=forged'))).toBe(401);
        expect(await statusOf(guess(app, 'c@example.com', 'device=forged'))).toBe(429);
        // A request with no cookie at all is not in that budget.
        expect(await statusOf(guess(app, 'd@example.com'))).toBe(401);
    });
});
