/**
 * The write-method standard, over real HTTP — `docs/api/write-methods.md`.
 *
 * One file for the rules that hold across modules: an empty string is never a value, a create
 * says where the new thing lives, and so on. A rule that belongs to one module's write lives in
 * that module's own tests.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { roleReaching } from '@tests/shopper-routes';
import { MISSING_ID } from '@tests/ids';
import { createProduct } from '@modules/products/tests/factories';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/** What one row of a table sends: the verb, the URL, and the body. */
type WriteCase = readonly [method: 'post' | 'put' | 'patch', url: string, body: object];

/**
 * Every optional free-text write field that carries `minLength: 1`, with `''` in it. The rest of
 * each body is valid, so the empty string is the only reason for the 422.
 */
const EMPTY_STRING_CASES: readonly WriteCase[] = [
    ['post', '/cart/checkout', { notes: '', expectedTotal: { amount: 0, currency: 'EUR' } }],
    ['put', '/cart/shipping-method', { shippingMethodId: '' }],
    [
        'post',
        '/account/addresses',
        { fullName: 'A', street: 's', city: 'c', zip: 'z', country: 'IT', label: '' }
    ],
    [
        'post',
        '/account/addresses',
        { fullName: 'A', street: 's', city: 'c', zip: 'z', country: 'IT', phone: '' }
    ],
    ['post', `/payments/order/${MISSING_ID}/offline`, { method: 'cash', reference: '' }],
    ['post', `/delivery/order/${MISSING_ID}/ship`, { trackingCode: '' }],
    ['post', '/inventory/receipts', { productId: MISSING_ID, quantity: 1, note: '' }],
    ['post', '/inventory/adjustments', { productId: MISSING_ID, delta: 1, note: '' }],
    ['patch', `/users/${MISSING_ID}`, { role: '' }],
    ['patch', `/users/${MISSING_ID}`, { username: 'ab' }],
    ['post', '/account/login/2fa', { challenge: '', code: '123456' }],
    ['post', '/account/reset-confirm', { token: '', password: 'Sup3r-secret-Passw0rd!' }],
    ['post', '/feedback/contact', { name: '', email: 'a@b.co', subject: 's', message: 'm' }],
    ['patch', `/products/${MISSING_ID}`, { tags: [''] }],
    ['patch', `/products/${MISSING_ID}`, { categories: [''] }],
    ['patch', `/webhooks/subscriptions/${MISSING_ID}`, { eventTypes: [''] }]
];

describe('an empty string is never a stored value', () => {
    it.each(EMPTY_STRING_CASES)('%s %s answers 422', async (method, url, body) => {
        const { bearer } = await authenticateAs(roleReaching({ path: url }));

        const response = await api()[method](url).set('Authorization', bearer).send(body);

        expect(response.status).toBe(422);
    });
});

describe('the body media type', () => {
    // Bug W8: a PATCH in any other type parsed as `{}`, which every all-optional schema accepts.
    it('refuses a PATCH body in an undeclared type with 415, changing nothing', async () => {
        const { bearer, user } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .set('Content-Type', 'text/plain')
            .send('username=someone-else');

        expect(response.status).toBe(415);
        const profile = await api().get('/account').set('Authorization', bearer);
        expect(profile.body.data.username).toBe(user.username);
    });

    it('applies a PATCH sent as application/merge-patch+json', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send(JSON.stringify({ username: 'merged-name' }));

        expect(response.status).toBe(200);
        expect(response.body.data.username).toBe('merged-name');
    });

    it('does not offer merge-patch on a PUT', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put('/account')
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send(JSON.stringify({ email: 'a@b.co', username: 'abc', analyticsConsent: false }));

        expect(response.status).toBe(415);
    });
});

describe('stock writes replay under an Idempotency-Key', () => {
    it.each([
        ['receipts', { quantity: 5 }, 5],
        ['adjustments', { delta: -2 }, -2]
    ])('a retried %s call moves the stock once', async (route, amount, expectedDelta) => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ title: 'Cedar Toy', price: 5, onHand: 10 });
        const send = () =>
            api()
                .post(`/inventory/${route}`)
                .set('Authorization', bearer)
                .set('Idempotency-Key', `stock-${route}-1`)
                .send({ productId: String(product._id), ...amount });

        const first = await send();
        const second = await send();

        expect(first.status).toBe(200);
        expect(second.headers['idempotent-replay']).toBe('true');
        expect(second.body).toEqual(first.body);
        expect(first.body.data.onHand).toBe(10 + expectedDelta);
    });
});

/** One contact request under a fixed key, as a client retrying would send it. */
const sendKeyedContact = () =>
    api()
        .post('/feedback/contact')
        .set('Idempotency-Key', 'located-replay-1')
        .send({ email: 'ada@example.com', subject: 'Replay', message: 'Once only, please.' });

describe('a 201 names the new resource in Location', () => {
    it('sends /users/{id} for an admin-created user', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().post('/users').set('Authorization', bearer).send({
            email: 'located@example.com',
            username: 'located'
        });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/users/${String(response.body.data.id)}`);
    });

    it('sends /feedback/{id} for a contact request', async () => {
        const response = await api().post('/feedback/contact').send({
            email: 'ada@example.com',
            subject: 'Located',
            message: 'Where did this land?'
        });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/feedback/${String(response.body.data.id)}`);
    });

    it('replays the Location with the body when a create is retried under its Idempotency-Key', async () => {
        const first = await sendKeyedContact();
        const second = await sendKeyedContact();

        expect(second.headers['idempotent-replay']).toBe('true');
        expect(second.headers.location).toBe(first.headers.location);
    });

    it('sends /webhooks/subscriptions/{id} for a subscription', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post('/webhooks/subscriptions')
            .set('Authorization', bearer)
            .send({ url: 'https://example.test/inbox', eventTypes: ['order.paid'] });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(
            `/webhooks/subscriptions/${String(response.body.data.id)}`
        );
    });

    it('sends /account for a signup, real or refused alike', async () => {
        const response = await api().post('/account/signup').send({
            email: 'joiner@example.com',
            username: 'joiner',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe('/account');
    });
});

describe('conditional writes (RFC 9110 §13.1.1)', () => {
    // The shared response check (`@tests/contract`) fails a 200 that forgets the `ETag` the spec
    // requires, and a 412 the operation never declared — so these cases pin the spec AND the server.
    it('refuses a stale If-Match on a PATCH with a documented 412', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .patch(`/products/${product.id}`)
            .set('Authorization', bearer)
            .set('If-Match', '"1"')
            .send({ active: false });

        expect(response.status).toBe(412);
        expect(response.body.errors[0].code).toBe('PRECONDITION_FAILED');
    });

    it('refuses a stale If-Match on a DELETE with a documented 412', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${product.id}`)
            .set('Authorization', bearer)
            .set('If-Match', '"1"');

        expect(response.status).toBe(412);
    });

    it('sends the ETag on a read and on the write that follows it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const read = await api().get(`/products/${product.id}`).set('Authorization', bearer);
        const write = await api()
            .patch(`/products/${product.id}`)
            .set('Authorization', bearer)
            .set('If-Match', read.headers.etag)
            .send({ active: false });

        expect(write.status).toBe(200);
        expect(write.headers.etag).not.toBe(read.headers.etag);
    });
});
