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
