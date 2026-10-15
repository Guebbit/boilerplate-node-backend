/**
 * @module
 * Contract tests for the address book over real HTTP: `/account/addresses`. The routes are mounted
 * under `/account` but owned by this module (`../../module.ts`), so their suite lives here, not
 * with `account`'s own.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

describe('the address book: /account/addresses', () => {
    const HOME = {
        label: 'home',
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    };

    it('walks the whole book: add, list, update, remove — one default throughout', async () => {
        const { bearer } = await authenticateAs('user');

        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        expect(added.status).toBe(201);
        expect(added.headers.location).toBe(`/account/addresses/${String(added.body.data.id)}`);
        expect(added.body.data.default).toBe(true);

        const second = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, label: 'office', street: 'Via Milano 2', default: true });
        expect(second.status).toBe(201);
        expect(second.body.data).toMatchObject({ label: 'office', default: true });

        const listed = await api().get('/account/addresses').set('Authorization', bearer);
        expect(listed.status).toBe(200);
        expect(listed.body.data.addresses).toHaveLength(2);
        const defaults = listed.body.data.addresses.filter(
            ({ default: d }: { default: boolean }) => d
        );
        expect(defaults.map(({ label }: { label: string }) => label)).toEqual(['office']);

        const officeId = second.body.data.id as string;
        const updated = await api()
            .patch(`/account/addresses/${officeId}`)
            .set('Authorization', bearer)
            .send({ city: 'Bologna' });
        expect(updated.status).toBe(200);
        expect(updated.body.data).toMatchObject({ id: officeId, city: 'Bologna' });

        const removed = await api()
            .delete(`/account/addresses/${officeId}`)
            .set('Authorization', bearer);
        expect(removed.status).toBe(200);
        // The promoted survivor keeps the book at exactly one default.
        expect(
            removed.body.data.addresses.map(({ default: d }: { default: boolean }) => d)
        ).toEqual([true]);
    });

    // The default is the book's pointer: an idempotent action of its own, not a field of
    // one address, so it leaves the PUT and PATCH bodies and answers the address itself.
    it('moves the default with PUT .../default, and repeating it changes nothing', async () => {
        const { bearer } = await authenticateAs('user');
        await api().post('/account/addresses').set('Authorization', bearer).send(HOME);
        const second = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, label: 'office', street: 'Via Milano 2' });
        const officeId = second.body.data.id as string;
        const send = () =>
            api().put(`/account/addresses/${officeId}/default`).set('Authorization', bearer);

        const first = await send();
        const again = await send();

        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ id: officeId, default: true });
        expect(again.body.data).toEqual(first.body.data);
        const listed = await api().get('/account/addresses').set('Authorization', bearer);
        expect(
            listed.body.data.addresses
                .filter(({ default: d }: { default: boolean }) => d)
                .map(({ label }: { label: string }) => label)
        ).toEqual(['office']);
    });

    it('refuses `default` in a PUT or PATCH body — it is no longer a field of one address', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ default: true });

        expect(response.status).toBe(422);
    });

    it('404s the default action for an entry the caller does not hold', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .put(`/account/addresses/${MISSING_ID}/default`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ label: 'incomplete' });

        expect(response.status).toBe(422);
    });

    // `country` is an ISO 3166-1 alpha-2 code, not free text — a full name or a lowercase
    // code both fail the contract's `CountryCode` pattern.
    it.each([
        ['a full country name', 'Italy'],
        ['a lowercase code', 'it'],
        ['a 3-letter code', 'ITA']
    ])('matches the error contract for %s as the country', async (_label, country) => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send({ ...HOME, country });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for an entry the caller does not hold', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .patch(`/account/addresses/${MISSING_ID}`)
            .set('Authorization', bearer)
            .send({ city: 'Nowhere' });

        expect(response.status).toBe(404);
    });

    // A PUT body IS the new resource (RFC 9110 §9.3.4) — every writable field
    // this resource has must be nameable, and the five identity fields are genuinely required.
    it('PUT replaces the whole entry, requiring every identity field', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .put(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({
                fullName: 'Ada L.',
                street: 'Via Torino 9',
                city: 'Torino',
                zip: '10121',
                country: 'IT'
            });

        expect(response.status).toBe(200);
        const replaced = response.body.data as { id: string; city: string; label?: string };
        expect(replaced.id).toBe(addressId);
        expect(replaced.city).toBe('Torino');
        // Omitted on a PUT — RFC 9110 clears it, not "leaves it alone".
        expect(replaced.label).toBeUndefined();
    });

    it('PUT refuses a body missing a required identity field', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .put(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ fullName: 'Ada L.', street: 'Via Torino 9', city: 'Torino', zip: '10121' });

        expect(response.status).toBe(422);
    });

    it('PATCH null clears the optional label, leaving everything else unchanged', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ label: null });

        expect(response.status).toBe(200);
        const patched = response.body.data as { label?: string; city: string };
        expect(patched.label).toBeUndefined();
        expect(patched.city).toBe(HOME.city);
    });

    it('PATCH refuses "" for the optional label, never a synonym for null', async () => {
        const { bearer } = await authenticateAs('user');
        const added = await api()
            .post('/account/addresses')
            .set('Authorization', bearer)
            .send(HOME);
        const addressId = added.body.data.id as string;

        const response = await api()
            .patch(`/account/addresses/${addressId}`)
            .set('Authorization', bearer)
            .send({ label: '' });

        expect(response.status).toBe(422);
    });

    it('answers the same 404 when REMOVING an entry the caller does not hold', async () => {
        /*
         * The same ownership path as the edit above, and it was the one method never asserted
         * against the contract. Worth its own case rather than trusting the symmetry: delete is
         * the method where "not found" and "not yours" are most tempting to answer differently,
         * and a distinguishable answer would confirm the id belongs to somebody.
         */
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .delete(`/account/addresses/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});
