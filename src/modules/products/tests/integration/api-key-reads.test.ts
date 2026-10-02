/**
 * @module
 * Product reads for an `sk_...` credential: its permissions mean what the same keys mean on a
 * session. `callerScope` takes `request.caller`, which a session and a key both resolve to, so a
 * key holding `products.any.read` sees drafts and soft-deleted rows, and a key without it reads
 * exactly the published catalogue a stranger reads.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { credentialHolding } from '@tests/credentials';
import { createProduct } from '@modules/products/tests/factories';
import { callerAs } from '@tests/callers';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { callerScope } from '../../services';

setupTestDb();

/** The `Authorization` header value for a credential's secret. */
const bearerOf = (secret: string): string => `Bearer ${secret}`;

describe('GET /products/:id with an api key', () => {
    it('shows a soft-deleted product to a key holding products.any.read', async () => {
        const product = await createProduct({ title: 'Withdrawn', deletedAt: new Date() });
        const secret = await credentialHolding(['products.any.read']);

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Authorization', bearerOf(secret));

        expect(response.status).toBe(200);
    });

    it('hides a soft-deleted product from a key without products.any.read', async () => {
        const product = await createProduct({ title: 'Withdrawn', deletedAt: new Date() });
        const secret = await credentialHolding(['users.any.read']);

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Authorization', bearerOf(secret));

        expect(response.status).toBe(404);
    });

    it('still shows a published product to a key minted for something else', async () => {
        const product = await createProduct({ title: 'On sale', active: true });
        const secret = await credentialHolding(['users.any.read']);

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Authorization', bearerOf(secret));

        expect(response.status).toBe(200);
    });
});

/** The titles a search answers, however the response wraps them. */
const titlesAt = async (secret: string): Promise<string[]> => {
    const response = await api().get('/products').set('Authorization', bearerOf(secret));
    const { items } = (response.body as { data: { items: { title: string }[] } }).data;

    return items.map(({ title }) => title).toSorted();
};

describe('GET /products with an api key', () => {
    it('lists drafts for a key holding products.any.read', async () => {
        await createProduct({ title: 'Live', active: true });
        await createProduct({ title: 'Draft', active: false });

        expect(await titlesAt(await credentialHolding(['products.any.read']))).toEqual([
            'Draft',
            'Live'
        ]);
    });

    it('lists only the published catalogue for a key without it', async () => {
        await createProduct({ title: 'Live', active: true });
        await createProduct({ title: 'Draft', active: false });

        expect(await titlesAt(await credentialHolding(['users.any.read']))).toEqual(['Live']);
    });
});

describe('the cache scope of a key caller', () => {
    /*
     * The cache middleware shares the guest's entry only when this is true, so a key that reads
     * more than a guest must make it false, or its wider answer would be stored under the guest's key.
     */
    it('is not the guest scope for a caller holding products.any.read', () => {
        expect(hasAnonymousReadScope(callerScope, callerAs('admin'))).toBe(false);
    });

    it('is the guest scope for a caller holding only the public baseline', () => {
        expect(hasAnonymousReadScope(callerScope, callerAs('customer'))).toBe(true);
    });
});
