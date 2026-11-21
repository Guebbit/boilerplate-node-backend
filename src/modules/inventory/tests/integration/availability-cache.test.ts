/**
 * Availability is cached per product for 60 seconds, and every change must reach the next reader.
 *
 * Risk:    the entry is a different cache from the response cache, with its own key and its own
 *          deleters (the stock funnel, two product events). A deleter that clears the wrong key, or
 *          none, serves a sold-out product as `in_stock` for a minute: a sale that is then refused
 *          at checkout.
 * Asserts: through the real routes and the real outbox, the entry for the CHANGED product is gone
 *          and the next read shows the new answer; an unrelated product's entry stays.
 * Double:  the cache adapter's value functions, in a Map that records each TTL. With no Redis the
 *          real adapter answers `undefined` to every read, so every request would miss and a test
 *          on it would prove nothing.
 * Real:    the routes, the service, the stock funnel, the outbox and the listeners.
 */

/** What the cache double holds: each key's text and the TTL it was stored with. */
const mockEntries = new Map<string, { value: string; ttlSeconds: number }>();

jest.mock('@infrastructure/adapters/cache', () => ({
    ...jest.requireActual('@infrastructure/adapters/cache'),
    getCacheValues: (keys: string[]) =>
        Promise.resolve(keys.map((key) => mockEntries.get(key)?.value)),
    setCacheValue: (key: string, value: string, ttlSeconds: number) => {
        mockEntries.set(key, { value, ttlSeconds });
        return Promise.resolve();
    },
    deleteCacheValues: (keys: string[]) => {
        for (const key of keys) mockEntries.delete(key);
        return Promise.resolve();
    }
}));

import { randomUUID } from 'node:crypto';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct, readProduct, saveProduct } from '@modules/products/tests/factories';
import { nudgeOutbox, settleOutboxNudges } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { testCallerContext } from '@tests/callers';
import { removeLevel } from '../factories';
import { inventoryService } from '../../services';

setupTestDb();

beforeEach(() => mockEntries.clear());

/** The cache key of one product's entry. */
const keyOf = (id: string) => `availability:${id}`;

/** Change a stored product behind the API's back, so no event announces it. */
const setOnProduct = (id: string, fields: { purchasable?: boolean; releaseDate?: Date }) =>
    readProduct(id).then((product) => {
        if (!product) throw new Error('product vanished');
        return saveProduct(Object.assign(product, fields));
    });

/** The status a read answers. */
const statusOf = (id: string, bearer?: string) => readAs(id, bearer).then(({ status }) => status);

/** The `availability` a read answers. */
const availabilityOf = (id: string, bearer?: string) =>
    readAs(id, bearer).then(({ body }) => String(body.availability));

/** What a guest reads for one product. */
const readAs = (id: string, bearer?: string) =>
    bearer
        ? api().get(`/products/${id}/availability`).set('Authorization', bearer)
        : api().get(`/products/${id}/availability`);

describe('the availability entry', () => {
    it('is stored for 60 seconds on a miss, and a hit does not touch the database', async () => {
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);

        await readAs(id);
        expect(mockEntries.get(keyOf(id))?.ttlSeconds).toBe(60);

        // The stored answer is what a second read sees, whatever the database now says.
        await setOnProduct(id, { purchasable: false });
        expect(await availabilityOf(id)).toBe('in_stock');
    });

    it('is cleared by a stock move on that product only', async () => {
        const { bearer } = await authenticateAs('admin');
        const sold = await createProduct({ onHand: 4 });
        const other = await createProduct({ onHand: 4 });
        await readAs(String(sold._id));
        await readAs(String(other._id));

        await api()
            .post(`/inventory/levels/${String(sold._id)}/adjust`)
            .set('Idempotency-Key', randomUUID())
            .set('Authorization', bearer)
            .send({ delta: -4 });

        expect(mockEntries.has(keyOf(String(sold._id)))).toBe(false);
        expect(mockEntries.has(keyOf(String(other._id)))).toBe(true);
        expect(await availabilityOf(String(sold._id))).toBe('out_of_stock');
    });

    it('is cleared when the product is edited off sale, through the outbox', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);
        await readAs(id);

        await api()
            .patch(`/products/${id}`)
            .set('Authorization', bearer)
            .send({ purchasable: false })
            .expect(200);
        await settleOutboxNudges();

        expect(mockEntries.has(keyOf(id))).toBe(false);
        expect(await availabilityOf(id)).toBe('out_of_stock');
    });

    it('is cleared when the product is soft-deleted and when it is restored', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);
        await readAs(id);

        await api().delete(`/products/${id}`).set('Authorization', bearer).expect(204);
        await settleOutboxNudges();
        expect(mockEntries.has(keyOf(id))).toBe(false);
        expect(await statusOf(id)).toBe(404);

        await readAs(id, bearer);
        await api().post(`/products/${id}/restore`).set('Authorization', bearer).expect(200);
        await settleOutboxNudges();
        expect(mockEntries.has(keyOf(id))).toBe(false);
        expect(await statusOf(id)).toBe(200);
    });

    it('is cleared by a stock move for every id the funnel is given, a product with no level row included', async () => {
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);
        await removeLevel(id);
        await readAs(id);
        expect(mockEntries.has(keyOf(id))).toBe(true);

        await inventoryService.forgetAvailability([id]);

        expect(mockEntries.has(keyOf(id))).toBe(false);
    });

    it('is cleared by the announcement of a payment that serves a preorder, not by the transaction itself', async () => {
        const product = await createProduct({ onHand: 0, allowBackorder: true });
        const id = String(product._id);
        await inventoryService.setBackorderLimit(id, 5);
        const orderId = 'd'.repeat(24);
        await inventoryService.reserveForOrder(orderId, [
            { productId: id, quantity: 2, kind: 'backorder' }
        ]);
        // The receipt finds only an unpaid hold, so nothing is allocated yet.
        await inventoryService.receive(id, 4, undefined, testCallerContext);
        await readAs(id);
        expect(mockEntries.has(keyOf(id))).toBe(true);

        // The payer's transaction cannot roll back a cache delete, so it leaves the entry alone.
        await withTransaction((session) => inventoryService.commitForOrder(orderId, session));
        expect(mockEntries.has(keyOf(id))).toBe(true);

        // Once it has committed and the relay delivers `inventory.backorder_allocated`, the entry goes.
        nudgeOutbox();
        await settleOutboxNudges();
        expect(mockEntries.has(keyOf(id))).toBe(false);
    });

    it("rebuilds from the database once the entry has expired, so a release date that has passed shows (the entry's TTL itself is asserted above)", async () => {
        const product = await createProduct({ onHand: 3, releaseDate: '2999-01-01' });
        const id = String(product._id);
        expect(await availabilityOf(id)).toBe('out_of_stock');

        // The date passes: nothing announces it. The entry's 60 seconds end, and the next read rebuilds.
        await setOnProduct(id, { releaseDate: new Date('2000-01-01T00:00:00.000Z') });
        mockEntries.delete(keyOf(id));

        expect(await availabilityOf(id)).toBe('in_stock');
    });

    it('never gives a guest a hidden product from a hit, and still gives it to an admin', async () => {
        const { bearer } = await authenticateAs('admin');
        const hidden = await createProduct({ onHand: 4, active: false });
        const id = String(hidden._id);

        // The admin's read builds the entry; the guest's is then a hit on it.
        expect(await statusOf(id, bearer)).toBe(200);
        expect(mockEntries.has(keyOf(id))).toBe(true);
        expect(await statusOf(id)).toBe(404);
        expect(await statusOf(id, bearer)).toBe(200);
    });

    it('treats an entry that is not an entry as a miss and rebuilds it', async () => {
        const product = await createProduct({ onHand: 4 });
        const id = String(product._id);
        mockEntries.set(keyOf(id), { value: 'not json', ttlSeconds: 60 });

        const response = await readAs(id);

        expect(response.body.availability).toBe('in_stock');
        expect(JSON.parse(mockEntries.get(keyOf(id))?.value ?? '')).toMatchObject({
            productId: id
        });
    });
});
