/**
 * Concurrency: the account endpoints.
 *
 * These drive the mounted app through supertest, N requests genuinely in flight at once, and
 * assert INVARIANTS rather than orderings — "one user exists", never "the first request won".
 * Which participant wins is the database's business and varies run to run; that it is exactly one
 * is the property.
 *
 * Two races here were real bugs, and both are fixed in the same change as these tests:
 *
 *   R1 — signup was check-then-insert against a NON-UNIQUE index. `findOne({ email })`, then
 *        `create()` if nothing came back, with the collection free to change in between. Two
 *        concurrent signups for one address both read "absent" and both inserted. Closed by
 *        `unique: true` on `users_email` plus the E11000 → 409 branch in
 *        `databaseErrorInterpreter` — in that order, because the index alone would have turned the
 *        duplicate account into a 500.
 *
 *   R4 — token writes were read-modify-write. `tokenAdd` pushed onto the loaded `tokens` array
 *        and called `save()`, which writes the WHOLE array as it looked at load time, so two
 *        concurrent logins each wrote N+1 tokens and the second erased the first. The user saw a
 *        successful login followed by an unauthenticated next request. Closed by `$push`/`$pull`
 *        against mongod rather than against a stale in-memory copy.
 *
 * Observed hit rates, N=10, 20 consecutive runs on 2026-08-08 (recorded because a race test that
 * never actually races is a green test measuring nothing):
 *   - signup:  20/20 runs saw at least one 409, i.e. the race was contended every time.
 *   - login:   before the R4 fix, 20/20 runs lost at least one token. After it, 0/20.
 *
 * `tests/support/race.ts` explains why `Promise.allSettled` and not `Promise.all`, why
 * `--runInBand` is irrelevant to the concurrency inside a test, and why 429 is asserted against.
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';
import { userRepository } from '@modules/users';
import { userModel, TokenType } from '@modules/users';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';

setupTestDb();

describe('R1 — concurrent signups for one address', () => {
    const email = 'contended@example.com';

    it('creates exactly one account, whichever request wins', async () => {
        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .post('/account/signup')
                .send({
                    email,
                    username: `racer${index}`,
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD
                })
        );

        expectNoServerErrors(results);

        // The invariant. Not "the first one won" — which one won is mongod's business.
        const accounts = await userModel.countDocuments({ email });
        expect(accounts).toBe(1);
    });

    it('answers one 201 and N-1 409s, with nothing in between', async () => {
        // The status split is the visible half of the fix. Before the unique index, several
        // participants got a 201. Before the E11000 branch, the losers got 500s.
        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .post('/account/signup')
                .send({
                    email,
                    username: `racer${index}`,
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD
                })
        );

        expect(countStatus(results, 201)).toBe(1);
        expect(countStatus(results, 409)).toBe(RACE_SIZE - 1);
    });

    it('leaves the surviving account usable', async () => {
        // A race resolved into a document that cannot log in would satisfy "exactly one user"
        // and still be broken.
        await raceN(RACE_SIZE, (index) =>
            api()
                .post('/account/signup')
                .send({
                    email,
                    username: `racer${index}`,
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD
                })
        );

        const login = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });

        expect(login.status).toBe(200);
    });

    it('still rejects a duplicate signup serially, with the same 409', async () => {
        // The pre-existing check-then-insert path still runs and still answers first when there
        // is no contention. The index is a backstop, not a replacement for the friendly error.
        await api().post('/account/signup').send({
            email,
            username: 'first',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD
        });

        const second = await api().post('/account/signup').send({
            email,
            username: 'second',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD
        });

        const accounts = await userModel.countDocuments({ email });
        expect(second.status).toBe(409);
        expect(accounts).toBe(1);
    });
});

describe('R4 — concurrent logins for one account', () => {
    it('keeps every issued token, losing none to a clobbering write', async () => {
        // This is the R4 probe. Read-modify-write loses tokens silently; the count is the only
        // thing that says so.
        const user = await createUser({ email: 'sessions@example.com' });

        const results = await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 200)).toBe(RACE_SIZE);

        const stored = await userRepository.findOneWithCredentials({ email: user.email });
        expect(stored?.tokens).toHaveLength(RACE_SIZE);
    });

    it('issues distinct tokens, so the count is not N copies of one', async () => {
        const user = await createUser({ email: 'sessions@example.com' });

        await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        const stored = await userRepository.findOneWithCredentials({ email: user.email });
        const values = (stored?.tokens ?? []).map((entry) => entry.token);

        expect(new Set(values).size).toBe(RACE_SIZE);
    });

    it('removes every token of a type under contention, not merely some', async () => {
        // The `$pull` half. Read-modify-write here leaves survivors — sessions that should have
        // been revoked and were not, which is the security-relevant direction of the same bug.
        const user = await createUser({ email: 'sessions@example.com' });

        const logins = await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        const token = logins
            .map((result) => (result.status === 'fulfilled' ? result.value : undefined))
            .find((response) => response?.status === 200)?.body?.data?.token;

        const results = await raceN(3, () =>
            api().post('/account/logout-all').set('Authorization', `Bearer ${token}`)
        );

        expectNoServerErrors(results);

        const stored = await userRepository.findOneWithCredentials({ email: user.email });
        expect(stored?.tokens?.filter((entry) => entry.type === 'refresh')).toHaveLength(0);
    });
});

describe('one-time tokens under contention', () => {
    it('lets exactly one of two simultaneous reset-confirms through', async () => {
        // A reset token is one-time. Two uses of it must not both change the password, and the
        // loser must be rejected rather than 500.
        const user = await createUser({ email: 'reset@example.com' });
        await user.tokenAdd(TokenType.PASSWORD_RESET, 60 * 60 * 1000, 'one-time-reset-token');

        const results = await raceN(2, () =>
            api().post('/account/reset-confirm').send({
                token: 'one-time-reset-token',
                password: 'BrandNew1!',
                passwordConfirm: 'BrandNew1!'
            })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 200)).toBe(1);

        // And the token is spent, whichever request spent it.
        const stored = await userRepository.findOneWithCredentials({ email: user.email });
        expect(stored?.tokens?.some((entry) => entry.token === 'one-time-reset-token')).toBe(false);
    });
});

describe('the limiter is raised for these suites, not disabled', () => {
    it('still refuses an unbounded run of failed logins', async () => {
        // `tests/support/setup.ts` raises NODE_AUTH_RATE_LIMIT_MAX to 1000 so a race is not
        // silently truncated into a vacuous pass. This case is what keeps that from quietly
        // becoming "the limiter is off": the budget is large, finite, and still enforced.
        //
        // A fresh limiter with a budget of 3 rather than 1000 failed requests, because the point
        // is that the mechanism works, not that this test can afford to spend the real budget.
        const original = process.env.NODE_AUTH_RATE_LIMIT_MAX;
        process.env.NODE_AUTH_RATE_LIMIT_MAX = '3';
        jest.resetModules();

        const expressModule = await import('express');
        const supertestModule = await import('supertest');
        const { authRateLimiter } = await import('@infrastructure/http/middlewares/security');
        const express = expressModule.default;
        const supertest = supertestModule.default;

        if (original === undefined) delete process.env.NODE_AUTH_RATE_LIMIT_MAX;
        else process.env.NODE_AUTH_RATE_LIMIT_MAX = original;

        const app = express();
        app.post('/probe', authRateLimiter, (_request, response) => {
            response.status(401).json({ ok: false });
        });

        const results = await raceN(6, () => supertest(app).post('/probe'));

        expect(countStatus(results, 429)).toBeGreaterThan(0);
    });
});
