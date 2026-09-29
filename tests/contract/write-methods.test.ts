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
