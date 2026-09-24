import express from 'express';
import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

/**
 * The credential-endpoint rate limiter and the antibot challenge gate — the hardening properties
 * that belong to `account/rate-limits.ts` itself, as opposed to the global error handler, which
 * stays a root-level suite at `tests/integration/auth-hardening.test.ts` since every module's
 * uncaught throw unwinds through it, not just this one's.
 */

setupTestDb();

/**
 * Freshly-constructed `credentialLimiters` with a small budget on each half.
 *
 * The two are separately settable because a case about one bucket has to leave the other with
 * room — give both the same budget and whichever fills first is the one every assertion sees.
 *
 * See {@link withReloadedRateLimits} for why a reload is what a small budget costs.
 */
const limitersWithBudget = (identityLimit: number, addressLimit = identityLimit) =>
    withReloadedRateLimits(
        () => import('@modules/account/rate-limits'),
        {
            NODE_AUTH_RATE_LIMIT_MAX: String(identityLimit),
            NODE_AUTH_RATE_LIMIT_ADDRESS_MAX: String(addressLimit)
        },
        (rateLimits) => rateLimits.credentialLimiters
    );

/**
 * A login app whose limiter AND challenge gate come out of ONE reload.
 *
 * They must share a module instance: the gate reads the property name the identity limiter was
 * configured with, so a second reload hands back a gate pointing at a limiter nobody is
 * spending. That is why {@link limitersWithBudget} cannot be reused here — it returns the
 * limiters alone.
 *
 * @param identityLimit - the per-identity budget the reloaded module is built with
 * @returns an express app answering 401 past the full chain
 */
const appWithBudget = async (identityLimit: number) => {
    const { credentialLimiters, loginChallengeGate } = await withReloadedRateLimits(
        () => import('@modules/account/rate-limits'),
        { NODE_AUTH_RATE_LIMIT_MAX: String(identityLimit) },
        (rateLimits) => rateLimits
    );

    const app = express();
    app.use(express.json());
    app.post(
        '/login',
        ...credentialLimiters,
        loginChallengeGate,
        (_request, response: express.Response) => {
            response.status(401).json({ success: false });
        }
    );
    return app;
};

describe('credential endpoints are rate limited separately', () => {
    /**
     * The global limiter is sized for browsing — a page of products costs several requests — so
     * applying it alone to `POST /account/login` allows a hundred password guesses a minute from
     * one address. A separate, smaller budget is what makes a credential list expensive; sharing
     * one bucket would mean raising the limit for legitimate traffic silently raises the guessing
     * rate too.
     *
     * Built against a trivial handler rather than `postLogin`: the property under test belongs to
     * the limiter, and routing it through a real controller would only add a database round trip
     * to every attempt.
     */
    afterEach(() => jest.resetModules());

    it('rejects further attempts with 429 once the budget is spent', async () => {
        const credentialLimiters = await limitersWithBudget(3);

        const limited = express();
        limited.post('/login', ...credentialLimiters, (_request, response) => {
            // Stands in for a failed credential check: a 4xx, which the limiter must count.
            response.status(401).json({ success: false });
        });

        const statuses: number[] = [];
        for (let index = 0; index < 5; index++) {
            const response = await supertest(limited).post('/login');
            statuses.push(response.status);
        }

        expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
        expect(statuses.slice(3)).toEqual([429, 429]);
    });

    /**
     * `skipSuccessfulRequests` is what keeps a shared address — an office, a school, CGNAT — from
     * locking out its own users for signing in correctly. Only failures are worth limiting.
     */
    it('does not spend the budget on successful attempts', async () => {
        const credentialLimiters = await limitersWithBudget(3);

        const limited = express();
        limited.post('/login', ...credentialLimiters, (_request, response) => {
            response.status(200).json({ success: true });
        });

        const statuses: number[] = [];
        for (let index = 0; index < 6; index++) {
            const response = await supertest(limited).post('/login');
            statuses.push(response.status);
        }

        expect(statuses.every((status) => status === 200)).toBe(true);
    });

    /**
     * The point of two buckets rather than one `email|ip` pair: guessing at ONE account is bounded
     * however many hosts it comes from, and a host is bounded however many accounts it names. A
     * pair key gives an attacker a fresh bucket for varying either half, which is why it is the
     * weakest of the three and not the strongest.
     */
    it('budgets one account separately from another at the same address', async () => {
        // Room on the address bucket, so it is the IDENTITY budget this case observes.
        const credentialLimiters = await limitersWithBudget(3, 50);

        const limited = express();
        limited.use(express.json());
        limited.post('/login', ...credentialLimiters, (_request, response) => {
            response.status(401).json({ success: false });
        });

        const attempt = (email: string) => supertest(limited).post('/login').send({ email });

        // Spend the first account's identity budget.
        for (let index = 0; index < 3; index++) await attempt('one@example.com');
        const spent = await attempt('one@example.com');
        expect(spent.status).toBe(429);

        // A different account still has its own, until the shared ADDRESS budget catches up.
        const other = await attempt('two@example.com');
        expect(other.status).toBe(401);
    });

    it('is mounted on the real login route', async () => {
        const user = await createUser({ email: 'limited@example.com' });

        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        // draft-7 headers are the limiter's fingerprint: present means it ran.
        expect(response.headers).toHaveProperty('ratelimit');
    });
});

describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent', () => {
    const ORIGINAL_PROVIDER = process.env.NODE_ANTIBOT_PROVIDER;

    afterEach(() => {
        jest.resetModules();
        if (ORIGINAL_PROVIDER === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
        else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL_PROVIDER;
    });

    it('never engages while no provider is selected, budget spent or not', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;
        const app = await appWithBudget(4);
        const attempt = () => supertest(app).post('/login').send({ email: 'ada@example.com' });

        for (let index = 0; index < 3; index++) {
            const response = await attempt();
            expect(response.status).toBe(401);
        }
    });

    it('passes an honest first attempt through untouched once a provider is selected', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        const app = await appWithBudget(4);

        const response = await supertest(app).post('/login').send({ email: 'ada@example.com' });

        // The credential check itself still answers — no 401 from the challenge gate demanding
        // a token nobody was asked to send yet.
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ success: false });
    });

    it('challenges once the identity budget is at least half spent', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        const app = await appWithBudget(4);
        const attempt = () => supertest(app).post('/login').send({ email: 'ada@example.com' });

        await attempt(); // first failure of four: well under half, stays honest

        const response = await attempt(); // second failure: exactly half of four

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('ANTIBOT_VERIFICATION_FAILED');
    });
});
