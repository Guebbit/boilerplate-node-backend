/**
 * @module
 * `actions` on a product: the server says which buttons the caller may press. A guest, and any
 * caller answered from the cache shared with guests, reads every flag `false`; a caller who sees
 * more reads the real ones, a deleted row offering restore instead of delete.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

/** Every flag `false`. */
const NOTHING = { update: false, delete: false, restore: false, hardDelete: false };

/** The `actions` of every row of a list response. */
const actionsOfRows = (response: { body: { items: { actions: unknown }[] } }) =>
    response.body.items.map((row) => row.actions);

describe('GET /products — actions', () => {
    it.each([
        ['a guest', undefined],
        ['a customer', 'customer']
    ])('is all false for %s', async (_who, role) => {
        await createProduct();
        const request = api().get('/products');
        const caller = role ? await authenticateAsRole(role) : undefined;
        const response = await (caller ? request.set('Authorization', caller.bearer) : request);

        expect(response.status).toBe(200);
        expect(actionsOfRows(response)).toEqual([NOTHING]);
    });

    it('tells staff what each row allows: delete on a live one, restore on a deleted one', async () => {
        const live = await createProduct({ title: 'Live' });
        const gone = await createProduct({ title: 'Gone', deletedAt: new Date() });
        const { bearer } = await authenticateAsRole('admin');

        const response = await api().get('/products').set('Authorization', bearer);

        const byId = Object.fromEntries(
            (response.body.items as { id: string; actions: unknown }[]).map((row) => [
                row.id,
                row.actions
            ])
        );
        expect(byId[live.id]).toEqual({
            update: true,
            delete: true,
            restore: false,
            hardDelete: true
        });
        expect(byId[gone.id]).toEqual({
            update: true,
            delete: false,
            restore: true,
            hardDelete: true
        });
    });

    // The guest's response is shared through the cache: warming it with staff's answer first
    // must never put a `true` in front of the next guest.
    it('keeps staff’s flags out of the guest’s cached answer', async () => {
        await createProduct();
        const { bearer } = await authenticateAsRole('admin');

        await api().get('/products').set('Authorization', bearer);
        const guest = await api().get('/products');

        expect(actionsOfRows(guest)).toEqual([NOTHING]);
    });
});

describe('GET /products/{id} and the writes — actions', () => {
    it('is all false for a guest and real for staff', async () => {
        const product = await createProduct();
        const { bearer } = await authenticateAsRole('admin');

        const guest = await api().get(`/products/${product.id}`);
        const staff = await api().get(`/products/${product.id}`).set('Authorization', bearer);

        expect(guest.body.actions).toEqual(NOTHING);
        expect(staff.body.actions).toEqual({
            update: true,
            delete: true,
            restore: false,
            hardDelete: true
        });
    });

    it('answers a restore with the live product: delete on, restore off', async () => {
        const gone = await createProduct({ deletedAt: new Date() });
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .post(`/products/${gone.id}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.actions).toMatchObject({ delete: true, restore: false });
    });
});
