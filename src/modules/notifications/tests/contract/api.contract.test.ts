/**
 * @module
 * Contract tests for /notifications.
 *
 * Every route answers one of two shapes — the inbox, or a 204 with no body — so these
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
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
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
        expect(response.body.items).toEqual([]);
    });

    it('matches the contract for an inbox holding a read and an unread notification', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id, readAt: new Date() });
        await createNotification({ userId: user.id });

        const response = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(2);
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
        expect(response.body.items.map(({ code }: { code: string }) => code).toSorted()).toEqual([
            'notifications.cart-merge-refused',
            'notifications.wishlist-item-removed'
        ]);
    });
});

describe('GET /notifications for a work notice', () => {
    it('matches the contract for both staff variants, shown to a member holding their sets', async () => {
        const { bearer, user } = await authenticateAs('admin');
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.staff.purchase-hold-placed',
                params: { userId: MISSING_ID, until: '2026-10-30T09:00:00.000Z' }
            },
            staff: { tenantId: DEPLOYMENT_TENANT_ID, sets: ['UserBanning'] }
        });
        await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.staff.webhook-disabled',
                params: { subscriptionId: MISSING_ID }
            },
            staff: { tenantId: DEPLOYMENT_TENANT_ID, sets: ['WebhookManagement'] }
        });

        const response = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(2);
        for (const item of response.body.items) expect(item.audience).toBe('staff');
        expect(JSON.stringify(response.body)).not.toContain('UserBanning');
    });

    it('answers 404 for a work notice whose sets the caller no longer holds', async () => {
        const { bearer, user } = await authenticateAs('user');
        const row = await createNotification({
            userId: user.id,
            body: {
                code: 'notifications.staff.webhook-disabled',
                params: { subscriptionId: MISSING_ID }
            },
            staff: { tenantId: DEPLOYMENT_TENANT_ID, sets: ['WebhookManagement'] }
        });

        const listed = await api().get('/notifications').set('Authorization', bearer);
        const single = await api()
            .get(`/notifications/${String(row._id)}`)
            .set('Authorization', bearer);

        expect(listed.body.items).toEqual([]);
        expect(single.status).toBe(404);
    });
});

describe('POST /notifications/read-all', () => {
    it('matches the contract and marks the caller’s notifications read', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id });

        const response = await api().post('/notifications/read-all').set('Authorization', bearer);
        const inbox = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(204);
        expect(inbox.body.items[0].readAt).toEqual(expect.any(String));
    });
});

describe('DELETE /notifications', () => {
    it('matches the contract and empties the caller’s inbox', async () => {
        const { bearer, user } = await authenticateAs('user');
        await createNotification({ userId: user.id });

        const response = await api().delete('/notifications').set('Authorization', bearer);
        const inbox = await api().get('/notifications').set('Authorization', bearer);

        expect(response.status).toBe(204);
        expect(inbox.body.items).toEqual([]);
    });
});

describe('GET /notifications/{id}', () => {
    it('reads one of the caller’s own notifications', async () => {
        const { bearer, user } = await authenticateAs('user');
        const row = await createNotification({ userId: user.id });

        const response = await api()
            .get(`/notifications/${String(row._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ id: String(row._id) });
    });

    it('answers 404, never 403, for someone else’s notification', async () => {
        const { bearer } = await authenticateAs('user');
        const other = await createUser({ email: 'other@example.com', username: 'other' });
        const row = await createNotification({ userId: other.id });

        const response = await api()
            .get(`/notifications/${String(row._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('answers 404 for an unknown id and a malformed one', async () => {
        const { bearer } = await authenticateAs('user');

        const unknown = await api()
            .get(`/notifications/${MISSING_ID}`)
            .set('Authorization', bearer);
        const malformed = await api()
            .get(`/notifications/${MALFORMED_ID}`)
            .set('Authorization', bearer);

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses an anonymous caller with 401', async () => {
        const response = await api().get(`/notifications/${MISSING_ID}`);

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

        expect(response.status).toBe(204);
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
        // A rejected opener ends the response the way a dropped connection would, with the error.
        onOpen().catch((error: unknown) => {
            if (settled) return;
            settled = true;
            callback(error instanceof Error ? error : new Error(String(error)), text);
        });
    };

/** The `jwt` session cookie a real login sets — the only credential `EventSource` can carry. */
const sessionCookie = async (identity: { email: string; username: string }) => {
    const user = await createUser(identity, 'customer');
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return {
        user,
        cookie: `__Host-session=${/^__Host-session=([^;]+)/.exec(setCookie(login, '__Host-session') ?? '')?.[1] ?? ''}`
    };
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
                    notificationsService.create([
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
