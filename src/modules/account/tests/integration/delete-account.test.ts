/**
 * @module
 * Self-deletion with a grace, over HTTP: `DELETE /account` locks the account at once and answers
 * 202, `POST /account/restore` spends the mailed link inside the grace. The status each request
 * answers with is what a caller actually receives, not what a mocked collaborator saw.
 *
 * The audit and analytics rows, the mail copy and the purge itself have suites of their own.
 */

import { api, staleBearerFor } from '@tests/http';
import { cookieHeader, setCookie } from '@tests/cookies';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { ACCOUNT_RESTORE_TOKEN_TYPE } from '@modules/account/services';
import { deletionPurgeAt } from '../../config';
import { plantToken, tokenTypesOf } from '../factories';
import { withoutInstance } from '@tests/problem';

/**
 * Every mail the app queued, newest last. Named `mock*` because `jest.mock` is hoisted above the
 * imports and may only close over identifiers with that prefix.
 */
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
    mockOutbox.length = 0;
});

/** A signed-in account: its bearer (fresh enough for `critical`) and its refresh cookie. */
const authenticate = async (email = 'doomed@example.com') => {
    const user = await createUser({ email, verifiedAt: new Date() });
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    return {
        user,
        bearer: `Bearer ${login.body.data.token as string}` as const,
        cookie: cookieHeader(login, '__Host-session')
    };
};

/** The token in the restore link of the scheduled-deletion mail the app queued. */
const mailedRestoreToken = (): string => {
    const mail = mockOutbox.find(({ template }) => template === 'account.deletion-scheduled');
    const link = new URL(String(mail?.data.linkUrl));
    return new URLSearchParams(link.hash.slice(1)).get('token') ?? '';
};

describe('DELETE /account', () => {
    it('answers 202 with the two dates, locks the account and mails the restore link', async () => {
        const { user, bearer } = await authenticate();

        const response = await api().delete('/account').set('Authorization', bearer).send();

        expect(response.status).toBe(202);
        const { requestedAt, purgeAt } = response.body.data as {
            requestedAt: string;
            purgeAt: string;
        };
        expect(purgeAt).toBe(deletionPurgeAt(new Date(requestedAt)).toISOString());
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedBy).toBe('owner');
        expect(stored?.purgeAt?.toISOString()).toBe(purgeAt);
        expect(mockOutbox.map(({ template }) => template)).toEqual(['account.deletion-scheduled']);
        expect(mailedRestoreToken()).not.toBe('');
    });

    it('clears the session cookies and ends every session at once, offering the restore at sign-in', async () => {
        const { user, bearer, cookie } = await authenticate();

        const response = await api().delete('/account').set('Authorization', bearer).send();

        const cookies = response.get('Set-Cookie') ?? [];
        expect(cookies.some((entry) => entry.startsWith('__Host-session='))).toBe(true);
        const profile = await api().get('/account').set('Authorization', bearer);
        const refresh = await api().post('/account/refresh').set('Cookie', cookie);
        expect([profile.status, refresh.status]).toEqual([401, 401]);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        // Signing in offers the restore and issues nothing.
        expect(login.body.data.deletionPending).toBe(true);
        expect(setCookie(login, '__Host-session')).toBeUndefined();
    });

    it('purges the pending links but keeps the way back', async () => {
        const { user, bearer } = await authenticate();
        await plantToken(user.id, 'password', 'pending-reset');

        await api().delete('/account').set('Authorization', bearer).send();

        expect(await tokenTypesOf(user.id)).toEqual([ACCOUNT_RESTORE_TOKEN_TYPE]);
    });

    describe('with a session past the critical window', () => {
        afterEach(() => jest.useRealTimers());

        it('answers 401 REAUTH_REQUIRED, mails nothing and locks nothing', async () => {
            const user = await createUser({ email: 'stale@example.com' });
            const bearer = await staleBearerFor(user, 'critical');

            const response = await api().delete('/account').set('Authorization', bearer).send();

            expect(response.status).toBe(401);
            expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
            expect(mockOutbox).toEqual([]);
            const stored = await userRepository.findById(user.id);
            expect(stored?.deletedAt).toBeUndefined();
        });
    });
});

/** Schedules a deletion over HTTP and returns the account and the mailed token. */
const scheduled = async (email = 'regret@example.com') => {
    const { user, bearer } = await authenticate(email);
    await api().delete('/account').set('Authorization', bearer).send();
    return { user, token: mailedRestoreToken() };
};

describe('POST /account/restore', () => {
    it('cancels the deletion, mails the confirmation and signs nobody in', async () => {
        const { user, token } = await scheduled();
        mockOutbox.length = 0;

        const response = await api().post('/account/restore').send({ token });

        expect(response.status).toBe(200);
        expect(response.get('Set-Cookie')).toBeUndefined();
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedAt).toBeUndefined();
        expect(stored?.purgeAt).toBeUndefined();
        expect(mockOutbox.map(({ template }) => template)).toEqual(['account.restored']);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(login.status).toBe(200);
    });

    it('refuses the same link a second time', async () => {
        const { token } = await scheduled('twice@example.com');
        await api().post('/account/restore').send({ token });

        const again = await api().post('/account/restore').send({ token });

        expect(again.status).toBe(422);
    });

    it('refuses an unknown token and an expired one, alike', async () => {
        const user = await createUser({ email: 'expired@example.com' });
        await plantToken(user.id, ACCOUNT_RESTORE_TOKEN_TYPE, 'stale', { ttlMs: -1000 });

        const unknown = await api().post('/account/restore').send({ token: 'never-issued' });
        const expired = await api().post('/account/restore').send({ token: 'stale' });

        expect([unknown.status, expired.status]).toEqual([422, 422]);
        expect(withoutInstance(expired.body)).toEqual(withoutInstance(unknown.body));
    });

    it('leaves an account whose grace has run out locked, even with a live link', async () => {
        const { user, token } = await scheduled('late@example.com');
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { purgeAt: new Date(Date.now() - 1000) } }
        );

        const response = await api().post('/account/restore').send({ token });

        expect(response.status).toBe(422);
        const stored = await userRepository.findById(user.id);
        expect(stored?.deletedBy).toBe('owner');
    });
});
