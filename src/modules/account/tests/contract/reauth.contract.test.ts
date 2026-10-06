/**
 * @module
 * Contract tests for step-up: which methods an account is offered, the mailed code an account with
 * no password passes with, and what the re-minted session claims (`amr`). The password path's own
 * session behaviour (cookie tiers, the failed re-mint) stays in `api.contract.test.ts`.
 */

import '@tests/contract';
import { decode } from 'jsonwebtoken';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { api } from '@tests/http';
import { freezeDate, advanceDate } from '@tests/clock';
import { createUser, userRepository, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { REAUTH_TIME_SENSITIVE } from '@kernel/middlewares/authorizations';
import { createAccessToken, createRefreshToken } from '../../session/jwt';
import { settleInlineExports } from '../../services/export';

/** Every queued mail, newest last — what the recipient would read. */
const mockOutbox: { template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn((_envelope: unknown, template: string, data: Record<string, unknown>) => {
        mockOutbox.push({ template, data });
        return Promise.resolve();
    })
}));

setupTestDb();

// A mailed code is offered only where mail reaches a person (`mailDeliversIn`): the suite's default
// `log` drops it, the `outbox` keeps it. `enqueueEmail` is mocked below, so nothing is sent.
beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

beforeEach(() => {
    mockOutbox.length = 0;
});

afterEach(() => jest.useRealTimers());

/** The code the last step-up mail carried. */
const mailedCode = (): string =>
    String(mockOutbox.findLast(({ template }) => template === 'account.reauth-code')?.data.code);

/** The `amr` claim of an access token. */
const amrOf = (token: string): string[] => (decode(token) as { amr: string[] }).amr;

/**
 * A session whose login proved `amr`, for an account that has (or has not) a password — the shape
 * an OAuth callback leaves behind, without a provider round trip.
 *
 * @param amr - what the login proved
 * @param withPassword - false for an account made through a provider
 */
const sessionFor = async (amr: string[], withPassword: boolean) => {
    const user = withPassword
        ? await createUser({ verifiedAt: new Date() })
        : await userRepository.create({
              username: 'oauthonly',
              email: 'oauth@example.com',
              verifiedAt: new Date()
          });
    const refreshToken = await createRefreshToken(user.id, undefined, amr);
    const token = await createAccessToken(refreshToken);
    return {
        user,
        bearer: `Bearer ${token}` as const,
        jwtCookie: `__Host-jwt=${refreshToken}`
    };
};

/** Ask for a code, then spend it. */
const reauthByEmail = async (bearer: string) => {
    await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();
    return api()
        .post('/account/reauth')
        .set('Authorization', bearer)
        .send({ method: 'email', code: mailedCode() });
};

describe('GET /account/reauth', () => {
    it('offers the password to an account that has one', async () => {
        const { bearer } = await sessionFor(['pwd'], true);

        const response = await api().get('/account/reauth').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ methods: ['password'] });
    });

    it('offers the mailed code to an account with no password', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await api().get('/account/reauth').set('Authorization', bearer);

        expect(response.body.data).toEqual({ methods: ['email'] });
    });

    it('offers nothing to an account with no password and no verified address', async () => {
        const user = await userRepository.create({
            username: 'nobody',
            email: 'nobody@example.com'
        });
        const token = await createRefreshToken(user.id, undefined, ['google']).then(
            createAccessToken
        );

        const response = await api().get('/account/reauth').set('Authorization', `Bearer ${token}`);

        expect(response.body.data).toEqual({ methods: [] });
    });

    it('matches the error contract with no session', async () => {
        const response = await api().get('/account/reauth');

        expect(response.status).toBe(401);
    });
});

describe('POST /account/reauth/methods/email/send', () => {
    it('mails the code and says where it went', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await api()
            .post('/account/reauth/methods/email/send')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ method: 'email', sentTo: 'o***h@example.com' });
        expect(mailedCode()).toMatch(/^\d{6}$/);
    });

    it('refuses an account that has a password', async () => {
        const { bearer } = await sessionFor(['pwd'], true);

        const response = await api()
            .post('/account/reauth/methods/email/send')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(422);
        expect(mockOutbox).toHaveLength(0);
    });

    it('answers 429 with a countdown inside the cooldown', async () => {
        const { bearer } = await sessionFor(['google'], false);
        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/reauth/methods/email/send')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(429);
        expect(mockOutbox).toHaveLength(1);
    });

    it('refuses a method that does not exist', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await api()
            .post('/account/reauth/methods/sms/send')
            .set('Authorization', bearer)
            .send();

        expect(response.status).toBe(422);
    });
});

describe('POST /account/reauth with a mailed code', () => {
    it('re-mints the session claiming only `email`, not what the login proved', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await reauthByEmail(bearer);

        expect(response.status).toBe(200);
        expect(amrOf(response.body.data.token as string)).toEqual(['email']);
    });

    it('spends the code: the same one cannot pass twice', async () => {
        const { bearer } = await sessionFor(['google'], false);
        await reauthByEmail(bearer);

        const replay = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'email', code: mailedCode() });

        expect(replay.status).toBe(422);
    });

    it('refuses a wrong code with a 422, never a 401', async () => {
        const { bearer } = await sessionFor(['google'], false);
        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'email', code: '000000' === mailedCode() ? '111111' : '000000' });

        expect(response.status).toBe(422);
    });

    it('burns the code after five wrong guesses, so the right one no longer passes', async () => {
        const { bearer } = await sessionFor(['google'], false);
        await api().post('/account/reauth/methods/email/send').set('Authorization', bearer).send();
        const wrong = '000000' === mailedCode() ? '111111' : '000000';
        for (let attempt = 0; attempt < 5; attempt++)
            await api()
                .post('/account/reauth')
                .set('Authorization', bearer)
                .send({ method: 'email', code: wrong });

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'email', code: mailedCode() });

        expect(response.status).toBe(422);
    });

    it('refuses a code when nothing was sent', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'email', code: '123456' });

        expect(response.status).toBe(422);
    });

    it('refuses an account that has a password, however right the code', async () => {
        const { bearer } = await sessionFor(['pwd'], true);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'email', code: '123456' });

        expect(response.status).toBe(422);
    });

    it('lets a stale session with no password get fresh again', async () => {
        freezeDate();
        const { bearer, jwtCookie } = await sessionFor(['google'], false);
        advanceDate((REAUTH_TIME_SENSITIVE + 1) * 1000);
        const stale = await api().post('/account/refresh').set('Cookie', jwtCookie);
        const staleBearer = `Bearer ${stale.body.data.token as string}`;
        expect(bearer).not.toBe(staleBearer);
        const blocked = await api()
            .post('/account/export')
            .set('Authorization', staleBearer)
            .send();
        expect(blocked.status).toBe(401);

        const fresh = await reauthByEmail(staleBearer);
        const allowed = await api()
            .post('/account/export')
            .set('Authorization', `Bearer ${fresh.body.data.token as string}`)
            .send();

        // 202: asking is what a fresh session unlocks; the build runs behind it.
        expect(allowed.status).toBe(202);
        await settleInlineExports();
    });

    it('asks a stale session to prove itself again before a download, too', async () => {
        freezeDate();
        const { jwtCookie } = await sessionFor(['pwd'], true);
        advanceDate((REAUTH_TIME_SENSITIVE + 1) * 1000);
        const stale = await api().post('/account/refresh').set('Cookie', jwtCookie);

        const response = await api()
            .get(`/account/export/${'0'.repeat(24)}`)
            .set('Authorization', `Bearer ${stale.body.data.token as string}`);

        expect(response.status).toBe(401);
    });
});

describe('POST /account/reauth with a password', () => {
    it('refuses an account with no password by saying so, not "wrong password"', async () => {
        const { bearer } = await sessionFor(['google'], false);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(response.status).toBe(422);
        expect(JSON.stringify(response.body)).toMatch(/no password/i);
    });

    it('does NOT keep the second factor the login proved: a password-only re-auth earns `pwd` alone', async () => {
        const { bearer } = await sessionFor(['pwd', 'otp'], true);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ method: 'password', password: PLAIN_PASSWORD });

        expect(amrOf(response.body.data.token as string)).toEqual(['pwd']);
    });

    it('rejects the untagged body the endpoint used to take', async () => {
        const { bearer } = await sessionFor(['pwd'], true);

        const response = await api()
            .post('/account/reauth')
            .set('Authorization', bearer)
            .send({ password: PLAIN_PASSWORD });

        expect(response.status).toBe(422);
    });
});
