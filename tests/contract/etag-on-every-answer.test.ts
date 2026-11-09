/**
 * A create, a restore or an action answers the resource's REAL tag and names the resource in
 * `Content-Location` (RFC 9110 §8.8.3, §15.3.2, §6.4.2 rule 7), so the next edit needs no read.
 *
 * What the suite proves, through the real app:
 * - the tag an answer carries is accepted as `If-Match` on the resource it names (the strong claim:
 *   Express's byte-hash would be refused with 412);
 * - a write that answers no resource of its own carries no tag at all;
 * - an idempotent replay keeps both headers.
 *
 * The shared `afterEach` (`@tests/contract`) walks the spec on every answer here: a write whose
 * operation declares `ETag` must send it, and a write that sends one the spec never declares fails.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

/** What a write answered, and who may follow it up. */
interface Answered {
    /** The write's own answer. */
    answer: { status: number; headers: Record<string, string> };
    /** The resource the answer's tag belongs to. */
    resource: string;
    /** The bearer that wrote it, which can also edit what it named. */
    bearer: string;
    /** A PATCH body the resource accepts, to put the tag to the test. */
    edit: Record<string, unknown>;
}

/** One write: how to make it, and the resource family whose edit proves the tag. */
interface Door {
    name: string;
    run: () => Promise<Answered>;
}

/** An admin edit of a user (`username`), of a product (`tags`), of an order or example. */
const EDITS = {
    user: { username: 'afterwards' },
    product: { tags: ['afterwards'] },
    order: { email: 'afterwards@example.com' },
    example: { title: 'Afterwards' },
    subscription: { description: 'afterwards' }
} as const;

/** A fresh user the admin may act on. */
const targetOf = (): Promise<string> =>
    createUser({ email: 'target@example.com', username: 'target' }).then((user) =>
        String(user._id)
    );

/** Posts `path` as `bearer`, with an optional body. */
const post = (path: string, bearer: string, body?: Record<string, unknown>) =>
    // No body at all for an action: it takes none, and a JSON content type would be refused with 415.
    api().post(path).set('Authorization', bearer).send(body);

/** A user door: an admin posts `path` to a fresh user and reads the user back. */
const userDoor = (name: string, path: string, body?: Record<string, unknown>): Door => ({
    name,
    run: async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await targetOf();
        const answer = await post(`/users/${id}${path}`, bearer, body);
        return { answer, resource: `/users/${id}`, bearer, edit: EDITS.user };
    }
});

/** A door that needs the user to be deactivated (or deleted) first. */
const userAfter = (name: string, setup: 'deactivate' | 'delete', path: string): Door => ({
    name,
    run: async () => {
        const { bearer } = await authenticateAs('admin');
        const id = await targetOf();
        if (setup === 'deactivate') await post(`/users/${id}/deactivate`, bearer).expect(200);
        else await api().delete(`/users/${id}`).set('Authorization', bearer).expect(204);
        const answer = await post(`/users/${id}${path}`, bearer);
        return { answer, resource: `/users/${id}`, bearer, edit: EDITS.user };
    }
});

/** The doors, one per family of answer the card lists. */
const DOORS: Door[] = [
    {
        name: 'POST /products (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/products', bearer, {
                price: '24.90',
                translations: { en: { title: 'Memory Foam Bed' } }
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.product
            };
        }
    },
    {
        name: 'POST /products/{id}/restore',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();
            const resource = `/products/${product.id}`;
            await api().delete(resource).set('Authorization', bearer).expect(204);
            const answer = await post(`${resource}/restore`, bearer);
            return { answer, resource, bearer, edit: EDITS.product };
        }
    },
    {
        name: 'POST /users (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/users', bearer, {
                email: 'located@example.com',
                username: 'located'
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.user
            };
        }
    },
    userDoor('POST /users/{id}/assign-role', '/assign-role', { role: 'support' }),
    userDoor('POST /users/{id}/place-purchase-hold', '/place-purchase-hold', {
        until: new Date(Date.now() + 86_400_000).toISOString()
    }),
    userDoor('POST /users/{id}/deactivate', '/deactivate'),
    userAfter('POST /users/{id}/activate', 'deactivate', '/activate'),
    userAfter('POST /users/{id}/restore', 'delete', '/restore'),
    {
        name: 'POST /orders (a create)',
        run: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const answer = await post('/orders', bearer, {
                userId: String(user._id),
                email: user.email,
                items: [{ productId: String(product._id), quantity: 1 }]
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.order
            };
        }
    },
    {
        name: 'POST /orders/{id}/cancel',
        run: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            const resource = `/orders/${String(order._id)}`;
            const answer = await post(`${resource}/cancel`, bearer);
            return { answer, resource, bearer, edit: EDITS.order };
        }
    },
    {
        name: 'POST /examples (a create)',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const answer = await post('/examples', bearer, { title: 'First', body: 'Hello' });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.example
            };
        }
    },
    {
        name: 'POST /examples/{id}/publish',
        run: async () => {
            const { bearer } = await authenticateAs('admin');
            const created = await post('/examples', bearer, { title: 'First', body: 'Hello' });
            const resource = created.headers['content-location'];
            const answer = await post(`${resource}/publish`, bearer);
            return { answer, resource, bearer, edit: EDITS.example };
        }
    },
    {
        name: 'POST /webhooks/subscriptions (a create)',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const answer = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            return {
                answer,
                resource: answer.headers['content-location'],
                bearer,
                edit: EDITS.subscription
            };
        }
    },
    {
        name: 'POST /webhooks/subscriptions/{id}/disable',
        run: async () => {
            const { bearer } = await authenticateAsRole('manager');
            const created = await post('/webhooks/subscriptions', bearer, {
                url: 'https://example.test/inbox',
                eventTypes: ['order.paid']
            });
            const resource = created.headers['content-location'];
            const answer = await post(`${resource}/disable`, bearer);
            return { answer, resource, bearer, edit: EDITS.subscription };
        }
    }
];

describe('a create, a restore or an action answers the real tag of the resource it names', () => {
    it.each(DOORS)('$name', async ({ run }) => {
        const { answer, resource, bearer, edit } = await run();

        expect(answer.status).toBeLessThan(300);
        expect(answer.headers['content-location']).toBe(resource);
        const tag = answer.headers.etag;

        // The tag is accepted as If-Match on the resource it names: Express's byte-hash would 412.
        await api()
            .patch(resource)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send(edit)
            .expect(200);
    });
});

/** A subscription's create also carries the one-time secret, which no GET repeats. */
const SECRET_CARRYING = 'POST /webhooks/subscriptions (a create)';

describe('the answer is what a GET on its Content-Location returns right after (RFC 9110 §8.7)', () => {
    // The tag is a digest of the exact body, so equal tags mean equal bodies.
    it.each(DOORS.filter(({ name }) => name !== SECRET_CARRYING))('$name', async ({ run }) => {
        const { answer, resource, bearer } = await run();

        const read = await api().get(resource).set('Authorization', bearer);

        expect(read.headers.etag).toBe(answer.headers.etag);
    });
});

describe('a write that answers no resource of its own carries no tag', () => {
    it('answers a search, which Express would hash, without an ETag', async () => {
        const { bearer } = await authenticateAs('admin');

        const answer = await post('/products/search', bearer).expect(200);

        expect(answer.headers).not.toHaveProperty('etag');
        expect(answer.headers).not.toHaveProperty('content-location');
    });

    it('answers a signup, real or not, tagless (nothing to edit yet)', async () => {
        const answer = await api().post('/account/signup').send({
            email: 'joiner@example.com',
            username: 'joiner',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(answer.status).toBe(201);
        expect(answer.headers).not.toHaveProperty('etag');
        expect(answer.headers).not.toHaveProperty('content-location');
    });
});

describe('an idempotent replay of a create keeps its tag and its Content-Location', () => {
    it('sends both again, marked as a replay', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const send = () =>
            api()
                .post('/orders')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'tagged-create-1')
                .send({
                    userId: String(user._id),
                    email: user.email,
                    items: [{ productId: String(product._id), quantity: 1 }]
                });

        const first = await send();
        const second = await send();

        expect(second.headers['idempotent-replayed']).toBe('true');
        expect(second.headers.etag).toBe(first.headers.etag);
        expect(second.headers['content-location']).toBe(first.headers['content-location']);
    });
});
