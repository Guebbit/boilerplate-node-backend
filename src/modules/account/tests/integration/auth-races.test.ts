/**
 * Concurrency on the account endpoints: N requests genuinely in flight through the mounted app,
 * asserting INVARIANTS ("one user exists"), never orderings ("the first won").
 *
 * R1:        a check-then-insert on a NON-UNIQUE index races: two signups for one address both
 *            read "absent" and both insert. `unique: true` on `users_email` plus the E11000 → 409
 *            branch in `databaseErrorInterpreter` closes it, in that order (the index alone turns
 *            the duplicate into a 500).
 * R4:        a login writes its own session row, so N concurrent logins leave N rows, none lost to
 *            a clobbering write, and one revocation under contention leaves none behind.
 * R5:        not a race to close but a decision to PROVE: refresh rotation must not read "two
 *            tabs refreshed in the same instant" as theft. `supersede` (`account/repository.ts`)
 *            lets exactly one exchange of a token WIN atomically; any other within
 *            `NODE_TOKEN_ROTATION_GRACE_MS` is reissued its own sibling token, not rejected.
 * Contended: measured at N=10 over 20 consecutive runs: signup saw a 409 in 20/20, and R4's
 *            read-modify-write shape lost a token in 20/20 where `$push`/`$pull` lost none.
 *            Recorded because a race test that never races measures nothing.
 *
 * `tests/support/race.ts` says why `Promise.allSettled`, why `--runInBand` does not matter here,
 * and why 429 is asserted against.
 */
import { api } from '@tests/http';
import { testCallerContext } from '@tests/callers';
import { accountService } from '../../services';
import { setupTestDb } from '@tests/setup-test-db';
import {
    createUser,
    PLAIN_PASSWORD,
    REPLACEMENT_PASSWORD,
    userRepository
} from '@modules/users/tests/factories';
import { RACE_SIZE, countStatus, expectNoServerErrors, raceN } from '@tests/race';
import { withReloadedRateLimits } from '@tests/rate-limit-harness';
import { cookieHeader, setCookie } from '@tests/cookies';
import { registerOAuthProvider } from '../../oauth/providers';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';
import { plantToken, sessionHashesOf, sessionRowsOf, tokenTypesOf } from '../factories';

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
                    passwordConfirm: PLAIN_PASSWORD,
                    termsAccepted: true
                })
        );

        expectNoServerErrors(results);

        // The invariant. Not "the first one won" — which one won is mongod's business.
        const accounts = await userRepository.count({ email });
        expect(accounts).toBe(1);
    });

    it('answers one 201 and N-1 409s, with nothing in between', async () => {
        /**
         * Both guards are necessary for this split: without `unique: true`, several participants
         * would get a 201; without the E11000 → 409 branch, the losers would get 500s.
         */
        const results = await raceN(RACE_SIZE, (index) =>
            api()
                .post('/account/signup')
                .send({
                    email,
                    username: `racer${index}`,
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD,
                    termsAccepted: true
                })
        );

        expect(countStatus(results, 201)).toBe(1);
        expect(countStatus(results, 409)).toBe(RACE_SIZE - 1);
    });

    it('leaves the surviving account usable', async () => {
        /**
         * A race resolved into a document that cannot log in would satisfy "exactly one user"
         * and still be broken.
         */
        await raceN(RACE_SIZE, (index) =>
            api()
                .post('/account/signup')
                .send({
                    email,
                    username: `racer${index}`,
                    password: PLAIN_PASSWORD,
                    passwordConfirm: PLAIN_PASSWORD,
                    termsAccepted: true
                })
        );

        const login = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });

        expect(login.status).toBe(200);
    });

    it('still rejects a duplicate signup serially, with the same 409', async () => {
        /**
         * The pre-existing check-then-insert path still runs and still answers first when there
         * is no contention. The index is a backstop, not a replacement for the friendly error.
         */
        await api().post('/account/signup').send({
            email,
            username: 'first',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        const second = await api().post('/account/signup').send({
            email,
            username: 'second',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        const accounts = await userRepository.count({ email });
        expect(second.status).toBe(409);
        expect(accounts).toBe(1);
    });
});

describe('R4 — concurrent logins for one account', () => {
    it('keeps every issued token, losing none to a clobbering write', async () => {
        /**
         * This is the R4 probe. Read-modify-write loses tokens silently; the count is the only
         * thing that says so.
         */
        const user = await createUser({ email: 'sessions@example.com' });

        const results = await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 200)).toBe(RACE_SIZE);

        expect(await sessionRowsOf(user.id)).toHaveLength(RACE_SIZE);
    });

    it('issues distinct tokens, so the count is not N copies of one', async () => {
        const user = await createUser({ email: 'sessions@example.com' });

        await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        const values = await sessionHashesOf(user.id);

        expect(new Set(values).size).toBe(RACE_SIZE);
    });

    it('removes every session under contention, not merely some', async () => {
        /**
         * The revocation half. A delete that raced a login could leave survivors — sessions that
         * should have been revoked and were not, which is the security-relevant direction.
         */
        const user = await createUser({ email: 'sessions@example.com' });

        const logins = await raceN(RACE_SIZE, () =>
            api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD })
        );

        const token = logins
            .map((result) => (result.status === 'fulfilled' ? result.value : undefined))
            .find((response) => response?.status === 200)?.body?.token;

        const results = await raceN(3, () =>
            api().delete('/account/sessions').set('Authorization', `Bearer ${token}`)
        );

        expectNoServerErrors(results);

        expect(await sessionRowsOf(user.id)).toHaveLength(0);
    });
});

/** A user with one live session, and the refresh cookie value it minted. */
const issueSession = async () => {
    const user = await createUser({ email: 'rotation-race@example.com' });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    const jwtCookie = (login.get('Set-Cookie') ?? []).find((cookie) =>
        cookie.startsWith('__Host-session=')
    )!;
    return { user, jwtCookie };
};

/** One start, then the callback request it leads to — built apart so the callbacks can overlap. */
const startAttempt = async () => {
    const start = await api().get('/account/oauth/fake');
    const callbackUrl = new URL(start.headers.location);
    return () =>
        api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', cookieHeader(start, '__Host-oauth_state', '__Host-oauth_verifier'));
};

describe('two simultaneous OAuth signups for one identity', () => {
    beforeAll(() => {
        registerOAuthProvider('fake', () => fakeOAuthProvider);
    });

    it('creates one account; a loser lands on provider_error, and a retry logs in', async () => {
        const callbacks = await Promise.all(Array.from({ length: RACE_SIZE }, startAttempt));

        const results = await raceN(RACE_SIZE, (index) => callbacks[index]());

        const responses = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : []
        );
        expect(responses).toHaveLength(RACE_SIZE);
        /**
         * Each answer is a redirect: a session, or a refusal — never a 500. A loser either hits the
         * unique index (`provider_error`) or finds the winner's account by email, which a sign-in
         * never links (`account_exists`); the retry below finds the identity and logs in.
         */
        for (const response of responses) {
            expect(response.status).toBe(302);
            const signedIn = setCookie(response, '__Host-session') !== undefined;
            const failed = ['provider_error', 'account_exists'].includes(
                new URL(response.headers.location).searchParams.get('error') ?? ''
            );
            expect(signedIn || failed).toBe(true);
        }
        expect(await userRepository.count({ email: 'oauth.demo@example.com' })).toBe(1);

        const retry = await (await startAttempt())();

        expect(retry.status).toBe(302);
        expect(setCookie(retry, '__Host-session')).toBeDefined();
    });
});

describe('R5 — concurrent refresh-token rotation, same cookie', () => {
    it('answers every simultaneous exchange with a working access token, none rejected', async () => {
        /**
         * Two tabs waking together, an interceptor retrying — all present the SAME cookie, and
         * under naive rotation the losers of the atomic claim would 401 as "theft".
         */
        const { jwtCookie } = await issueSession();

        const results = await raceN(RACE_SIZE, () =>
            api().post('/account/refresh').set('Cookie', jwtCookie)
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 200)).toBe(RACE_SIZE);
    });

    it('mints a DISTINCT refresh token for every racer, not N copies of one', async () => {
        const { jwtCookie } = await issueSession();

        const results = await raceN(RACE_SIZE, () =>
            api().post('/account/refresh').set('Cookie', jwtCookie)
        );

        const rotatedCookies = results
            .map((result) => (result.status === 'fulfilled' ? result.value : undefined))
            .flatMap((response) => response?.get('Set-Cookie') ?? [])
            .filter((cookie) => cookie.startsWith('__Host-session='));

        expect(rotatedCookies).toHaveLength(RACE_SIZE);
        expect(new Set(rotatedCookies).size).toBe(RACE_SIZE);
    });

    it('leaves exactly ONE superseded ancestor behind — the original, claimed once', async () => {
        /**
         * Every racer reissues its own sibling token (RACE_SIZE new, live entries — proven above),
         * but they all raced to supersede the SAME starting token, and `supersede`'s atomic
         * claim means only the FIRST write can ever flip it. There is exactly one ancestor to mark,
         * and it gets marked exactly once, however many racers tried.
         */
        const { user, jwtCookie } = await issueSession();

        await raceN(RACE_SIZE, () => api().post('/account/refresh').set('Cookie', jwtCookie));

        const rows = await sessionRowsOf(user.id);
        expect(rows.filter((row) => !row.supersededAt)).toHaveLength(RACE_SIZE);
        expect(rows.filter((row) => row.supersededAt)).toHaveLength(1);
    });
});

describe('one-time tokens under contention', () => {
    it('lets exactly one of two simultaneous reset-confirms through', async () => {
        /**
         * A reset token is one-time. Two uses of it must not both change the password, and the
         * loser must be rejected rather than 500.
         */
        const user = await createUser({ email: 'reset@example.com' });
        await plantToken(user.id, 'password', 'one-time-reset-token', { ttlMs: 60 * 60 * 1000 });

        const results = await raceN(2, () =>
            api().post('/account/password/reset/confirm').send({
                token: 'one-time-reset-token',
                password: REPLACEMENT_PASSWORD,
                passwordConfirm: REPLACEMENT_PASSWORD,
                termsAccepted: true
            })
        );

        expectNoServerErrors(results);
        expect(countStatus(results, 204)).toBe(1);

        // And the token is spent, whichever request spent it.
        expect(await tokenTypesOf(user.id)).not.toContain('password');
    });

    it('leaves exactly one live link after simultaneous reset requests', async () => {
        /**
         * The issue is one atomic upsert per (account, kind): requests racing it must not leave
         * two working links, as the old remove-then-add pair could. Driven through the service,
         * since the route answers before its detached work has finished.
         */
        const user = await createUser({ email: 'reset-twice@example.com' });

        const results = await raceN(RACE_SIZE, () =>
            accountService.requestPasswordReset(user.email, testCallerContext)
        );

        expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
        const types = await tokenTypesOf(user.id);
        expect(types.filter((type) => type === 'password')).toHaveLength(1);
    });
});

describe('the limiter is raised for these suites, not disabled', () => {
    it('still refuses an unbounded run of failed logins', async () => {
        /**
         * `tests/support/setup-environment.ts` raises NODE_AUTH_RATE_LIMIT_MAX to 1000 so a race is not
         * silently truncated into a vacuous pass. This case is what keeps that from quietly
         * becoming "the limiter is off": the budget is large, finite, and still enforced.
         *
         * A fresh limiter with a budget of 3 rather than 1000 failed requests, because the point
         * is that the mechanism works, not that this test can afford to spend the real budget.
         */
        const { credentialLimiters } = await withReloadedRateLimits(
            () => import('@modules/account/rate-limits'),
            { NODE_AUTH_RATE_LIMIT_MAX: '3' },
            (module) => module
        );

        const expressModule = await import('express');
        const supertestModule = await import('supertest');
        const express = expressModule.default;
        const supertest = supertestModule.default;

        const app = express();
        app.use(express.json());
        app.post('/probe', ...credentialLimiters, (_request, response) => {
            response.status(401).json({ ok: false });
        });

        // The identity budget counts attempts at one named account; a body naming none spends nothing.
        const results = await raceN(6, () =>
            supertest(app).post('/probe').send({ email: 'someone@example.com' })
        );

        expect(countStatus(results, 429)).toBeGreaterThan(0);
    });
});
