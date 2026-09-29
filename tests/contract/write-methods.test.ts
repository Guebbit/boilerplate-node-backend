/**
 * The write-method standard, over real HTTP — `docs/api/write-methods.md`.
 *
 * One file for the rules that hold across modules: an empty string is never a value, a create
 * says where the new thing lives, and so on. A rule that belongs to one module's write lives in
 * that module's own tests.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { MISSING_ID } from '@tests/ids';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** What one row of a table sends: the verb, the URL, and the body. */
type WriteCase = readonly [method: 'post' | 'put' | 'patch', url: string, body: object];

/**
 * Every optional free-text write field that carries `minLength: 1`, with `''` in it. The rest of
 * each body is valid, so the empty string is the only reason for the 422.
 */
const EMPTY_STRING_CASES: readonly WriteCase[] = [
    ['post', '/cart/checkout', { notes: '' }],
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
        const { bearer } = await authenticateAs('admin');

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

describe('stock writes replay under an Idempotency-Key (WM-D9)', () => {
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
