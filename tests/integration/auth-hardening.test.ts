import express from 'express';
import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';

/**
 * Two hardening properties that are invisible until someone attacks them.
 */

setupTestDb();

/**
 * Freshly-constructed `credentialLimiters` with a small budget on each half.
 *
 * The two are separately settable because a case about one bucket has to leave the other with room
 * — give both the same budget and whichever fills first is the one every assertion sees.
 *
 * `rateLimit()` reads its options once, at construction, so the module has to be re-evaluated
 * for a different budget to take effect — the suite otherwise runs with the raised limit from
 * `tests/support/setup.ts`.
 */
const limitersWithBudget = async (identityLimit: number, addressLimit = identityLimit) => {
    const originals = {
        identity: process.env.NODE_AUTH_RATE_LIMIT_MAX,
        address: process.env.NODE_AUTH_RATE_LIMIT_ADDRESS_MAX
    };
    process.env.NODE_AUTH_RATE_LIMIT_MAX = String(identityLimit);
    process.env.NODE_AUTH_RATE_LIMIT_ADDRESS_MAX = String(addressLimit);
    jest.resetModules();

    const { credentialLimiters } = await import('@infrastructure/http/middlewares/rate-limit');

    for (const [name, value] of [
        ['NODE_AUTH_RATE_LIMIT_MAX', originals.identity],
        ['NODE_AUTH_RATE_LIMIT_ADDRESS_MAX', originals.address]
    ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }

    return credentialLimiters;
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

describe('the 500 handler', () => {
    /**
     * An unexpected error is precisely the case where nobody chose the wording: a driver error
     * naming hosts and ports, an ENOENT naming a filesystem layout, a client quoting a URL with a
     * key in it. None of it may reach an unauthenticated caller.
     */
    it('tells the client nothing about what actually threw', async () => {
        const { handleUncaughtError } = await import('@app/error-handling');
        const secret = 'mongodb://admin:hunter2@internal-db:27017';

        const throwing = express();
        throwing.get('/boom', () => {
            throw new Error(`connection failed to ${secret}`);
        });
        throwing.use(handleUncaughtError);

        const response = await supertest(throwing).get('/boom');

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('hunter2');
        expect(JSON.stringify(response.body)).not.toContain('internal-db');
        // A chosen, translated message still reaches the user, and the stable code still reaches
        // the client's error handling.
        expect(response.body.errors[0].code).toBe('INTERNAL_ERROR');
        expect(response.body.errors[0].message).toBeTruthy();
    });

    /**
     * The other side of the rule: an error whose text was CHOSEN is still returned. Losing that
     * would turn every deliberate rejection into a blank 500.
     */
    it('still returns the copy a deliberate error carries', async () => {
        const { handleUncaughtError } = await import('@app/error-handling');
        const errors = await import('@infrastructure/http/errors');

        const throwing = express();
        throwing.get('/boom', () => {
            throw new errors.ExtendedError('ValidationError', 422, true, ['Pick a shorter name']);
        });
        throwing.use(handleUncaughtError);

        const response = await supertest(throwing).get('/boom');

        expect(response.status).toBe(422);
        expect(response.body.errors).toContainEqual(
            expect.objectContaining({ message: 'Pick a shorter name' })
        );
    });
});
