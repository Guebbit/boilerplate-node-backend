/**
 * A sign-in token that no longer names a live session, presented on a page anyone may read.
 *
 * It is refused with 401 `invalid_token` (RFC 6750 §3.1) so the client can refresh and carry on as
 * the person it was, instead of the page quietly answering as a guest and the session never being
 * seen as active. No token at all is still a guest. The idle reason is covered next to the idle
 * timeout, in `account`'s own suite.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { solvedChallenge, useAltcha } from '@tests/altcha';
import { createProduct } from '@modules/products/tests/factories';
import { dropAllSessions } from '@modules/account/tests/factories';
import { findAllTasks } from '@modules/tasks/tests/factories';

setupTestDb();

describe('a revoked bearer on GET /products/:id', () => {
    it('is refused 401 invalid_token, not served as a guest', async () => {
        const product = await createProduct({ title: 'On sale', active: true });
        const { user, bearer } = await authenticateAs('user');
        await dropAllSessions(user.id);

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    });

    it('is a guest read when no bearer is sent at all', async () => {
        const product = await createProduct({ title: 'On sale', active: true });

        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.status).toBe(200);
    });

    it('is a read as the person while the bearer is still good', async () => {
        const product = await createProduct({ title: 'On sale', active: true });
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });
});

/** A valid contact message. */
const CONTACT_PAYLOAD = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Broken checkout',
    message: 'The checkout button does nothing on mobile.'
};

describe('POST /tasks, which accepts a sign-in without requiring one', () => {
    beforeEach(() => {
        useAltcha();
    });

    it('refuses a revoked bearer 401, and the single-use human check is not spent', async () => {
        const { user, bearer } = await authenticateAs('user');
        await dropAllSessions(user.id);
        const challenge = await solvedChallenge();

        const refused = await api()
            .post('/tasks')
            .set('Authorization', bearer)
            .set(challenge)
            .send(CONTACT_PAYLOAD);
        // The same solution, on the retry the client makes without the dead token.
        const retried = await api().post('/tasks').set(challenge).send(CONTACT_PAYLOAD);

        expect(refused.status).toBe(401);
        expect(refused.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
        expect(retried.status).toBe(202);
        expect(await findAllTasks()).toHaveLength(1);
    });

    it('files the message under the signed-in sender while the bearer is good', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .post('/tasks')
            .set('Authorization', bearer)
            .set(await solvedChallenge())
            .send(CONTACT_PAYLOAD);

        expect(response.status).toBe(202);
        const [stored] = await findAllTasks();
        expect(String(stored?.subjectId)).toBe(String(user._id));
    });

    it('files a guest message as before when no bearer is sent', async () => {
        const response = await api()
            .post('/tasks')
            .set(await solvedChallenge())
            .send(CONTACT_PAYLOAD);

        expect(response.status).toBe(202);
        const [stored] = await findAllTasks();
        expect(stored?.subjectId).toBeUndefined();
    });
});

describe('POST /analytics/events', () => {
    const VIEW = { event: 'product_viewed', productId: '65a1b2c3d4e5f60718293a4b' };

    it('refuses a revoked bearer 401', async () => {
        const { user, bearer } = await authenticateAs('user');
        await dropAllSessions(user.id);

        const response = await api()
            .post('/analytics/events')
            .set('Authorization', bearer)
            .send(VIEW);

        expect(response.status).toBe(401);
    });

    it('answers a guest 204 when no bearer is sent', async () => {
        const response = await api().post('/analytics/events').send(VIEW);

        expect(response.status).toBe(204);
    });
});
