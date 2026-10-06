/**
 * @module
 * Connected accounts: listing the providers linked to the caller, disconnecting one behind a fresh
 * session, and the reset-confirm mail naming what is still connected.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { freezeDate, advanceDate } from '@tests/clock';
import { REAUTH_TIME_SENSITIVE } from '@kernel/middlewares/authorizations';
import { createUser, userRepository, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { cookieHeader } from '@tests/cookies';

/** Every queued mail, newest last. */
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

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
    mockOutbox.length = 0;
});

afterEach(() => jest.useRealTimers());

/** A signed-in account with Google and GitHub connected. */
const linkedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date() });
    for (const provider of ['google', 'github'])
        await userRepository.linkOAuthAccount(user.id, {
            provider,
            providerId: `${provider}-subject`,
            connectedAt: new Date('2026-01-01T00:00:00.000Z')
        });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return {
        user,
        bearer: `Bearer ${login.body.data.token as string}`,
        cookie: cookieHeader(login, '__Host-jwt')
    };
};

/** The stored provider names linked to an account, straight from the database. */
const linksOf = (userId: string): Promise<string[]> =>
    userRepository
        .findByIdWithCredentials(userId)
        .then((stored) => (stored?.oauthAccounts ?? []).map(({ provider }) => provider));

/** Reset a password through the real route. */
const resetFor = (token: string) =>
    api().post('/account/reset-confirm').send({
        token,
        password: REPLACEMENT_PASSWORD,
        passwordConfirm: REPLACEMENT_PASSWORD
    });

describe('GET /account/oauth/links', () => {
    it('lists the connected providers and when, never a provider identifier', async () => {
        const { bearer } = await linkedAccount();

        const response = await api().get('/account/oauth/links').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.links).toEqual([
            { provider: 'google', connectedAt: '2026-01-01T00:00:00.000Z' },
            { provider: 'github', connectedAt: '2026-01-01T00:00:00.000Z' }
        ]);
        expect(JSON.stringify(response.body)).not.toContain('-subject');
    });

    it('lists nothing for a password-only account, and needs a session', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });

        const own = await api()
            .get('/account/oauth/links')
            .set('Authorization', `Bearer ${login.body.data.token as string}`);
        const anonymous = await api().get('/account/oauth/links');

        expect(own.body.data.links).toEqual([]);
        expect(anonymous.status).toBe(401);
    });
});

describe('DELETE /account/oauth/links/{provider}', () => {
    it('disconnects one provider and leaves the other', async () => {
        const { user, bearer } = await linkedAccount();

        const response = await api()
            .delete('/account/oauth/links/google')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await linksOf(user.id)).toEqual(['github']);
    });

    it('answers 404 for a provider that is not connected', async () => {
        const { bearer } = await linkedAccount();
        await api().delete('/account/oauth/links/google').set('Authorization', bearer);

        const again = await api()
            .delete('/account/oauth/links/google')
            .set('Authorization', bearer);

        expect(again.status).toBe(404);
    });

    it('may remove the last sign-in method: forgot-password recovers the account', async () => {
        const { user, bearer } = await linkedAccount();
        await api().delete('/account/oauth/links/google').set('Authorization', bearer);

        const last = await api().delete('/account/oauth/links/github').set('Authorization', bearer);

        expect(last.status).toBe(200);
        expect(await linksOf(user.id)).toEqual([]);
    });

    it('needs a fresh session', async () => {
        freezeDate();
        const { cookie } = await linkedAccount();
        advanceDate((REAUTH_TIME_SENSITIVE + 1) * 1000);
        // The access token expired along the way; the refresh cookie mints one whose `auth_time` is old.
        const refreshed = await api().post('/account/refresh').set('Cookie', cookie);

        const response = await api()
            .delete('/account/oauth/links/google')
            .set('Authorization', `Bearer ${refreshed.body.data.token as string}`);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
    });

    it('cannot touch another account: only the caller’s own links are ever addressed', async () => {
        const { user: owner } = await linkedAccount();
        const other = await createUser({ verifiedAt: new Date(), email: 'other@example.com' });
        const login = await api()
            .post('/account/login')
            .send({ email: other.email, password: PLAIN_PASSWORD });

        const response = await api()
            .delete('/account/oauth/links/google')
            .set('Authorization', `Bearer ${login.body.data.token as string}`);

        expect(response.status).toBe(404);
        expect(await linksOf(owner.id)).toHaveLength(2);
    });
});

describe('the reset-confirm mail', () => {
    it('names the providers still connected, so the owner can act on them', async () => {
        const { user } = await linkedAccount();
        await user.tokenAdd('password', 3_600_000, 'reset-names-providers');

        const response = await resetFor('reset-names-providers');

        const mail = mockOutbox.find(({ template }) => template === 'account.reset-confirm');
        expect(response.status).toBe(200);
        expect(String(mail?.data.providers)).toContain('Google, Github');
    });

    it('says so when no provider is connected', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        await user.tokenAdd('password', 3_600_000, 'reset-no-providers');

        await resetFor('reset-no-providers');

        const mail = mockOutbox.find(({ template }) => template === 'account.reset-confirm');
        expect(String(mail?.data.providers)).toMatch(/No Google or GitHub sign-in/);
    });
});
