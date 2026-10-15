/**
 * @module
 * An admin deactivating or soft-deleting an account moves its session epoch, so the tokens it held
 * stay dead after an unban or a restore (ASVS V7.4.2). Without the epoch, only the account's
 * `active`/`deletedAt` gate kept them out, and clearing either brought every old token back.
 * Driven over HTTP: the admin's own request, then the old holder's next one.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** One second and a little: the epoch and a token's `auth_time` compare in whole seconds. */
const PAST_THE_SECOND_MS = 1100;

/** Sleeps into the next whole second. */
const nextSecond = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, PAST_THE_SECOND_MS);
    });

/** A login as `email`: the bearer its access token makes. */
const loginAs = (email: string): Promise<string> =>
    api()
        .post('/account/login')
        .send({ email, password: PLAIN_PASSWORD })
        .then((response) => `Bearer ${response.body.data.token as string}`);

/** `GET /account` with a bearer: 200 while the token is live, 401 once it is not. */
const statusWith = (bearer: string): Promise<number> =>
    api()
        .get('/account')
        .set('Authorization', bearer)
        .then((response) => response.status);

describe('deactivating an account', () => {
    it('keeps the tokens it held dead after the account is reactivated', async () => {
        const { bearer: admin } = await authenticateAs('admin');
        const target = await createUser({ verifiedAt: new Date() }, 'customer');
        const held = await loginAs(target.email);
        expect(await statusWith(held)).toBe(200);
        // The epoch and the token's `auth_time` compare in whole seconds.
        await nextSecond();

        const ban = { username: target.username, role: null, active: false };
        await api().put(`/users/${target.id}`).set('Authorization', admin).send(ban);
        await api()
            .put(`/users/${target.id}`)
            .set('Authorization', admin)
            .send({ ...ban, active: true });

        expect(await statusWith(held)).toBe(401);
    });

    it('lets the owner sign in again after the reactivation', async () => {
        const { bearer: admin } = await authenticateAs('admin');
        const target = await createUser({ verifiedAt: new Date() }, 'customer');
        const ban = { username: target.username, role: null, active: false };
        await api().put(`/users/${target.id}`).set('Authorization', admin).send(ban);
        await api()
            .put(`/users/${target.id}`)
            .set('Authorization', admin)
            .send({ ...ban, active: true });

        await nextSecond();

        expect(await statusWith(await loginAs(target.email))).toBe(200);
    });

    it('does not end sessions when the update leaves the account active', async () => {
        const { bearer: admin } = await authenticateAs('admin');
        const target = await createUser({ verifiedAt: new Date() }, 'customer');
        const held = await loginAs(target.email);

        await api()
            .put(`/users/${target.id}`)
            .set('Authorization', admin)
            .send({ username: 'renamed', role: null, active: true });

        expect(await statusWith(held)).toBe(200);
    });
});

describe('soft-deleting an account', () => {
    it('keeps the tokens it held dead after the account is restored', async () => {
        const { bearer: admin } = await authenticateAs('admin');
        const target = await createUser({ verifiedAt: new Date() }, 'customer');
        const held = await loginAs(target.email);
        expect(await statusWith(held)).toBe(200);
        await nextSecond();

        await api().delete(`/users/${target.id}`).set('Authorization', admin);
        await api().post(`/users/${target.id}/restore`).set('Authorization', admin);

        expect(await statusWith(held)).toBe(401);
    });
});
