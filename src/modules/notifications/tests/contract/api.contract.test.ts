/**
 * @module
 * Contract tests for /notifications.
 *
 * Every route answers one of two shapes — the inbox, or the plain success envelope — so these
 * assertions exist to make sure each contract branch is reached over HTTP, including the refusals.
 * The ownership and cap rules are in the integration suite. `GET /notifications/stream` is an
 * endless SSE stream, read here only as far as the one frame each test needs.
 */
import type { IncomingMessage } from 'node:http';
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { setCookie } from '@tests/cookies';
import { MISSING_ID } from '@tests/ids';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { createNotification } from '@modules/notifications/tests/factories';

setupTestDb();

/** An id no ObjectId can be built from; id-taking routes answer it as they answer an unknown one. */
const MALFORMED_ID = 'not-an-object-id';

describe('GET /notifications', () => {
    it('matches the contract for an empty inbox', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('matches the contract for an inbox holding a read and an unread notification', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id, readAt: new Date() });
        await createNotification({ userId: user.id });

        const response = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(2);
    });

    it('matches the contract for every variant of the union, each with its own params', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.wishlist-item-removed',
                params: { productId: 'p2', titles: { en: 'Red mug' } }
            }
        });
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.cart-merge-refused',
                params: { lines: [{ productId: 'p3', requested: 4, titles: { en: 'Green mug' } }] }
            }
        });

        const response = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(
            response.body.data.items.map(({ code }: { code: string }) => code).toSorted()
        ).toEqual(['notifications.cart-merge-refused', 'notifications.wishlist-item-removed']);
    });

    it('matches the error contract with no session', async () => {
        const response = await api().get('/notifications');

        expect(response.status).toBe(401);
    });
});

describe('POST /notifications/read-all', () => {
    it('matches the contract and marks the caller’s notifications read', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id });

        const response = await api().post('/notifications/read-all').set('Authorization', bearer);
        const inbox = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(inbox.body.data.items[0].readAt).toEqual(expect.any(String));
    });

    it('matches the error contract with no session', async () => {
        const response = await api().post('/notifications/read-all');

        expect(response.status).toBe(401);
    });
});

describe('POST /notifications/dismiss-all', () => {
    it('matches the contract and empties the caller’s inbox', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id });

        const response = await api()
            .post('/notifications/dismiss-all')
            .set('Authorization', bearer);
        const inbox = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(inbox.body.data.items).toEqual([]);
    });

    it('matches the error contract with no session', async () => {
        const response = await api().post('/notifications/dismiss-all');

        expect(response.status).toBe(401);
    });
});

describe('DELETE /notifications/{id}', () => {
    it('matches the contract when deleting one’s own notification', async () => {
        const { bearer, user } = await authenticateAs('user');
        const row = await createNotification({ userId: user.id });

        const response = await api()
            .delete(`/notifications/${String(row._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('matches the error contract for a notification that is someone else’s', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com', username: 'other' });
        const row = await createNotification({ userId: other.id });

        const response = await api()
            .delete(`/notifications/${String(row._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for an id that does not exist', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/notifications/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/notifications/${MALFORMED_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract with no session', async () => {
        const response = await api().delete(`/notifications/${MISSING_ID}`);

        expect(response.status).toBe(401);
    });
});

/**
 * Reads an endless SSE response until a frame naming `event` arrives, then hangs up. `onOpen` runs
 * once the headers are in, which is the moment the stream is registered — so a notification
 * written from it is one the stream must deliver.
 */
const untilEvent =
    (event: string, onOpen: () => Promise<unknown>) =>
    (response: unknown, callback: (error: Error | null, body: string) => void) => {
        // supertest hands its raw response over as `unknown`; it is the node stream.
        const stream = response as IncomingMessage;
        let text = '';
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            callback(null, text);
        };
        stream.on('data', (chunk: Buffer) => {
            text += chunk.toString();
            if (text.includes(`event: ${event}`) && text.endsWith('\n\n')) stream.destroy();
        });
        stream.on('close', finish);
        stream.on('end', finish);
        void onOpen();
    };

/** The `jwt` session cookie a real login sets — the only credential `EventSource` can carry. */
const sessionCookie = async (identity: { email: string; username: string }) => {
    const user = await createUser(identity, 'customer');
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, cookie: `jwt=${/^jwt=([^;]+)/.exec(setCookie(login, 'jwt') ?? '')?.[1] ?? ''}` };
};

describe('GET /notifications/stream', () => {
    it('matches the contract for a session: an event stream carrying a new notification', async () => {
        const { user, cookie } = await sessionCookie({ email: 'sse@example.com', username: 'sse' });

        const response = await api()
            .get('/notifications/stream')
            .set('Cookie', cookie)
            .buffer(true)
            .parse(
                untilEvent('notifications.created', () =>
                    notificationsService.notificationsCreate([
                        {
                            userId: user._id,
                            code: 'notifications.cart-line-removed',
                            severity: 'warning',
                            params: { productId: 'p1', titles: { en: 'Blue mug' } }
                        }
                    ])
                )
            );

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(String(response.body)).toContain('"code":"notifications.cart-line-removed"');
    });

    it('matches the error contract with no session', async () => {
        const response = await api().get('/notifications/stream');

        expect(response.status).toBe(401);
    });
});
