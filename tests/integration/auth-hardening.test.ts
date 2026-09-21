import express from 'express';
import supertest from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

/**
 * Two hardening properties that are invisible until someone attacks them.
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

/**
 * What the global error handler answers for a thrown value, over real HTTP.
 *
 * Mounted behind a route that throws rather than called directly: `handleUncaughtError` is an
 * express error handler, and half of what is under test is that express routes a synchronous
 * throw to it at all.
 *
 * `import()` inside, not at the top of the file: cases elsewhere here call
 * `jest.resetModules()`, so a handler captured once would be a stale instance holding a stale
 * `t()`.
 *
 * @param thrown - what the route throws
 * @returns the supertest response
 */
const answerFor = (thrown: unknown) =>
    import('@app/error-handling').then(({ handleUncaughtError }) => {
        const throwing = express();
        throwing.get('/boom', () => {
            throw thrown;
        });
        throwing.use(handleUncaughtError);
        return supertest(throwing).get('/boom');
    });

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

describe('the 500 handler', () => {
    /**
     * An unexpected error is precisely the case where nobody chose the wording: a driver error
     * naming hosts and ports, an ENOENT naming a filesystem layout, a client quoting a URL with a
     * key in it. None of it may reach an unauthenticated caller.
     */
    it('tells the client nothing about what actually threw', async () => {
        const secret = 'mongodb://admin:hunter2@internal-db:27017';

        const response = await answerFor(new Error(`connection failed to ${secret}`));

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('hunter2');
        expect(JSON.stringify(response.body)).not.toContain('internal-db');
        // A chosen, translated message still reaches the user, and the stable code still reaches
        // the client's error handling.
        expect(response.body.errors[0].code).toBe('INTERNAL_ERROR');
        expect(response.body.errors[0].message).toBeTruthy();
    });

    /**
     * A REAL body-parser rejection, produced by driving the parser rather than hand-setting
     * `.status` on an `Error`. A faked shape would assert that the handler reads the fields the
     * test wrote, which is the one thing not in question — what matters is that the fields
     * body-parser actually sets are the fields it reads.
     */
    it('answers a genuine oversized-body rejection with its own status', async () => {
        const { handleUncaughtError } = await import('@app/error-handling');
        const parsing = express();
        parsing.use(express.json({ limit: '100b' }));
        parsing.post('/echo', (_request, response) => response.json({ ok: true }));
        parsing.use(handleUncaughtError);

        const response = await supertest(parsing)
            .post('/echo')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ padding: 'x'.repeat(500) }));

        expect(response.status).toBe(413);
        expect(response.body.errors[0].code).toBe('PAYLOAD_TOO_LARGE');
    });

    /**
     * `expose` is half the contract, and the half a test has to state: a 4xx on an error the
     * thrower still considers internal is NOT the client's business. Drop the `expose` check and
     * every library that annotates an internal failure with a 4xx starts leaking its own status.
     */
    it('ignores a client status on an error that does not expose itself', async () => {
        const response = await answerFor(
            Object.assign(new Error('internal detail'), { status: 400, expose: false })
        );

        expect(response.status).toBe(500);
        expect(response.body.errors[0].code).toBe('INTERNAL_ERROR');
    });

    /** And the range is the other half — an exposed 5xx is still a server fault. */
    it('does not hand a 5xx back to the client just because it is exposed', async () => {
        const response = await answerFor(
            Object.assign(new Error('upstream is down'), { status: 503, expose: true })
        );

        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain('upstream');
    });

    /**
     * The other side of the rule: an error whose text was CHOSEN is still returned. Losing that
     * would turn every deliberate rejection into a blank 500. `MulterError` is the one throw
     * shape this handler still translates by hand — everything else answers `rejectResponse`
     * directly instead of unwinding through here.
     */
    it('still returns the copy a deliberate error carries', async () => {
        const multer = await import('multer');

        const response = await answerFor(new multer.MulterError('LIMIT_FILE_SIZE', 'avatar'));

        expect(response.status).toBe(400);
        expect(response.body.errors).toContainEqual(
            expect.objectContaining({ message: 'File too large' })
        );
    });
});
