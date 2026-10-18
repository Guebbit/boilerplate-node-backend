/**
 * The staff idle timeout over real HTTP, in both session modes: a staff session that saw no real
 * request for too long ends (`401 SESSION_IDLE`, the session revoked), a shopper's never does, and
 * a request that says it is passive never counts as the person acting.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { sessionModel } from '../../model';
import { sessionRowsOf } from '../factories';
import { cookieHeader } from '@tests/cookies';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { seedMembership } from '@modules/access/tests/factories';

setupTestDb();

/** The two session modes a deployment may run. */
const MODES = ['jwt', 'cookie'] as const;

/** The staff limit these cases run under, in seconds. */
const LIMIT = 1800;

beforeEach(() => {
    setEnvironment({ NODE_SESSION_IDLE_TIME_STAFF: String(LIMIT) });
});

/** Signs a role in as a bearer client and answers the account and the `Authorization` header. */
const signInAs = async (role: 'customer' | 'editor') => {
    const user = await createUser({ email: `${role}@example.com`, verifiedAt: new Date() }, role);
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD, transport: 'bearer' });
    const credential = (login.body.data.token ?? login.body.data.sessionToken) as string;
    return { user, bearer: `Bearer ${credential}` };
};

/** Pretends the account's sessions last saw a request `seconds` ago. */
const idleFor = (userId: string, seconds: number) =>
    sessionModel
        .updateMany({ userId }, { $set: { lastUsedAt: new Date(Date.now() - seconds * 1000) } })
        .exec();

describe.each(MODES)('the staff idle timeout in %s mode', (mode) => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: mode });
    });

    it('lets a staff session that has been used within the limit carry on', async () => {
        const { user, bearer } = await signInAs('editor');
        await idleFor(user.id, LIMIT - 60);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('ends a staff session idle past the limit: 401 SESSION_IDLE, and the session is revoked', async () => {
        const { user, bearer } = await signInAs('editor');
        await idleFor(user.id, LIMIT + 60);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('SESSION_IDLE');
        expect(await sessionRowsOf(user.id)).toEqual([]);
    });

    it('never idles a shopper out, however long the session has sat', async () => {
        const { user, bearer } = await signInAs('customer');
        await idleFor(user.id, LIMIT * 100);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('does not idle anyone out while the timeout is switched off', async () => {
        setEnvironment({ NODE_SESSION_IDLE_TIME_STAFF: '0' });
        const { user, bearer } = await signInAs('editor');
        await idleFor(user.id, LIMIT * 100);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('counts an ordinary request as activity', async () => {
        const { user, bearer } = await signInAs('editor');
        await idleFor(user.id, 600);

        await api().get('/account').set('Authorization', bearer).expect(200);

        // The stamp is written off the request's path; the next read sees it.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const [row] = await sessionRowsOf(user.id);
        expect(Date.now() - row.lastUsedAt!.getTime()).toBeLessThan(60_000);
    });

    it('does not count a passive request as activity', async () => {
        const { user, bearer } = await signInAs('editor');
        await idleFor(user.id, 600);

        await api()
            .get('/account')
            .set('Authorization', bearer)
            .set('X-Session-Passive', 'true')
            .expect(200);

        await new Promise((resolve) => setTimeout(resolve, 100));
        const [row] = await sessionRowsOf(user.id);
        expect(Date.now() - row.lastUsedAt!.getTime()).toBeGreaterThan(590_000);
    });

    it('answers the idle clock on a touch: the limit for staff, none for a shopper', async () => {
        const staff = await signInAs('editor');
        const shopper = await signInAs('customer');

        const forStaff = await api()
            .post('/account/session/touch')
            .set('Authorization', staff.bearer);
        const forShopper = await api()
            .post('/account/session/touch')
            .set('Authorization', shopper.bearer);

        expect(forStaff.status).toBe(200);
        expect(forStaff.body.data.idleTimeoutSeconds).toBe(LIMIT);
        expect(forShopper.body.data).not.toHaveProperty('idleTimeoutSeconds');
        expect(forShopper.body.data.lastActiveAt).toEqual(expect.any(String));
    });
});

/** Signs a staff account in and answers it with the refresh cookie as the browser would hold it. */
const signInStaff = async () => {
    const user = await createUser(
        { email: 'refresher@example.com', verifiedAt: new Date() },
        'editor'
    );
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, cookie: cookieHeader(login, '__Host-session') };
};

describe('the staff idle timeout at POST /account/refresh (jwt mode)', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt' });
    });

    it('refuses an idled-out staff family with 401 SESSION_IDLE, and removes the family', async () => {
        const { user, cookie } = await signInStaff();
        await idleFor(user.id, LIMIT + 60);

        const response = await api().post('/account/refresh').set('Cookie', cookie);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('SESSION_IDLE');
        expect(await sessionRowsOf(user.id)).toEqual([]);
    });

    it('lets a staff family idle within the limit refresh', async () => {
        const { user, cookie } = await signInStaff();
        await idleFor(user.id, LIMIT - 60);

        const response = await api().post('/account/refresh').set('Cookie', cookie);

        expect(response.status).toBe(200);
    });
});

/** The staff lifetime cap these cases run under, in seconds. */
const CAP = 86_400;

/** Pretends the account signed in `seconds` ago and has been busy ever since. */
const signedInFor = (userId: string, seconds: number) =>
    sessionModel
        .updateMany(
            { userId },
            { $set: { startedAt: new Date(Date.now() - seconds * 1000), lastUsedAt: new Date() } }
        )
        .exec();

describe.each(MODES)('the staff lifetime cap in %s mode', (mode) => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: mode, NODE_SESSION_LIFETIME_STAFF: String(CAP) });
    });

    it('ends a busy staff session signed in past the cap: a plain 401, the session revoked', async () => {
        const { user, bearer } = await signInAs('editor');
        await signedInFor(user.id, CAP + 60);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).not.toBe('SESSION_IDLE');
        expect(await sessionRowsOf(user.id)).toEqual([]);
    });

    it('lets a staff session inside the cap carry on', async () => {
        const { user, bearer } = await signInAs('editor');
        await signedInFor(user.id, CAP - 600);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('never caps a shopper, however old the sign-in', async () => {
        const { user, bearer } = await signInAs('customer');
        await signedInFor(user.id, CAP * 20);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('does not cap anyone while the cap is switched off', async () => {
        setEnvironment({ NODE_SESSION_LIFETIME_STAFF: '0' });
        const { user, bearer } = await signInAs('editor');
        await signedInFor(user.id, CAP * 20);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('caps a customer promoted to staff mid-session, from the next request', async () => {
        const { user, bearer } = await signInAs('customer');
        await signedInFor(user.id, CAP + 60);
        await api().get('/account').set('Authorization', bearer).expect(200);

        await seedMembership(user.id, DEPLOYMENT_TENANT_ID, 'tenant', 'editor');
        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(401);
    });

    it('shows the cap as the end of a staff session in the list, not the row’s later expiry', async () => {
        const { user, bearer } = await signInAs('editor');
        await signedInFor(user.id, CAP - 3600);

        const response = await api().get('/account/sessions').set('Authorization', bearer);

        const [session] = response.body.data.sessions as {
            createdAt: string;
            expiration: string;
        }[];
        const lived = Date.parse(session.expiration) - Date.parse(session.createdAt);
        expect(lived).toBe(CAP * 1000);
    });
});

describe('the staff lifetime cap at POST /account/refresh (jwt mode)', () => {
    beforeEach(() => {
        setEnvironment({ NODE_SESSION_MODE: 'jwt', NODE_SESSION_LIFETIME_STAFF: String(CAP) });
    });

    it('refuses a refresh of a staff family past the cap with a plain 401, and removes it', async () => {
        const { user, cookie } = await signInStaff();
        await signedInFor(user.id, CAP + 60);

        const response = await api().post('/account/refresh').set('Cookie', cookie);

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).not.toBe('SESSION_IDLE');
        expect(await sessionRowsOf(user.id)).toEqual([]);
    });
});
