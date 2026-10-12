/**
 * @module
 * A hard delete takes the account's roles with it in the same transaction as the account, through
 * `access`'s own erase hook — never ahead of it. Driven over HTTP so the real module list builds
 * the erase hooks, the way a deployment does.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { membershipsOf } from '@modules/access';
import { createUser, userRepository } from '@modules/users/tests/factories';
import type { PersonalDataEraser } from '@kernel/registry';
import { personalDataErasers, setPersonalDataErasers } from '../../erasure-registry';

setupTestDb();

/** The hooks the app registered at boot, put back after a case swaps them. */
const bootErasers = personalDataErasers();

afterEach(() => {
    setPersonalDataErasers(bootErasers);
});

/** An erase hook that fails after `access`'s has already run, as a later module's might. */
const failingEraser: PersonalDataEraser = (): Promise<void> =>
    Promise.resolve().then(() => {
        throw new Error('a later hook failed');
    });

describe('hard-deleting an account', () => {
    it('removes the role it holds, with the account', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({}, 'customer');

        const response = await api()
            .delete(`/users/${target.id}?hardDelete=true`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await membershipsOf(target.id)).toEqual([]);
        expect(await userRepository.findById(target.id)).toBeNull();
    });

    it('keeps its roles when a later step of the erasure fails and the account stays', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({}, 'customer');
        setPersonalDataErasers([...bootErasers, failingEraser]);

        const response = await api()
            .delete(`/users/${target.id}?hardDelete=true`)
            .set('Authorization', bearer);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(await userRepository.findById(target.id)).not.toBeNull();
        expect(await membershipsOf(target.id)).toHaveLength(1);
    });
});
