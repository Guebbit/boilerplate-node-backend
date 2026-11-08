/**
 * @module
 * `POST /account/addresses` with an `Idempotency-Key`: a retry after a lost answer replays the
 * first entry instead of writing a duplicate that burns a slot of the cap. A new key still writes.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { sendTwice } from '@tests/replay';
import { addressService } from '../../service';
import { HOME } from './fixtures';

setupTestDb();

/** The caller adds `HOME` under `key`. */
const add = (bearer: string, key: string) =>
    api()
        .post('/account/addresses')
        .set('Authorization', bearer)
        .set('Idempotency-Key', key)
        .send(HOME);

/** The caller's stored entries. */
const addressesOf = (userId: string) => addressService.list(userId).then((view) => view.addresses);

describe('POST /account/addresses with an Idempotency-Key', () => {
    it('writes one entry and replays its answer to a retry', async () => {
        const { user, bearer } = await authenticateAs('user');

        const { first, retry } = await sendTwice(() => add(bearer, 'address-key-1'));

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.headers['idempotent-replayed']).toBe('true');
        expect(retry.body).toEqual(first.body);
        expect(await addressesOf(user.id)).toHaveLength(1);
    });

    it('writes another entry for a new key: two clicks make two', async () => {
        const { user, bearer } = await authenticateAs('user');

        await sendTwice(() => add(bearer, 'address-key-1'));
        const second = await add(bearer, 'address-key-2');

        expect(second.status).toBe(201);
        expect(await addressesOf(user.id)).toHaveLength(2);
    });
});
