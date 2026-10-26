/**
 * @module
 * `userService.staffContacts`: of the members a staff notice is for, who can actually act on it.
 * A staff role is withheld without an armed authenticator, and a banned or deleted account signs
 * nobody in, so neither is told.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { userService } from '@modules/users/services';
import { createUser } from '@modules/users/tests/factories';

setupTestDb();

describe('staffContacts', () => {
    it('answers the address and the language of an armed, live account', async () => {
        const armed = await createUser({
            email: 'armed@example.com',
            username: 'armed',
            locale: 'it',
            authenticatorEnabledAt: new Date()
        });

        await expect(userService.staffContacts([armed.id])).resolves.toEqual([
            { id: armed.id, email: 'armed@example.com', locale: 'it' }
        ]);
    });

    it('leaves out an account without an authenticator app, a banned one and a deleted one', async () => {
        const armed = await createUser({
            email: 'armed@example.com',
            username: 'armed',
            authenticatorEnabledAt: new Date()
        });
        const unarmed = await createUser({ email: 'unarmed@example.com', username: 'unarmed' });
        const banned = await createUser({
            email: 'banned@example.com',
            username: 'banned',
            authenticatorEnabledAt: new Date(),
            active: false
        });
        const deleted = await createUser({
            email: 'deleted@example.com',
            username: 'deleted',
            authenticatorEnabledAt: new Date(),
            deletedAt: new Date()
        });

        const contacts = await userService.staffContacts([
            armed.id,
            unarmed.id,
            banned.id,
            deleted.id
        ]);

        expect(contacts.map(({ id }) => id)).toEqual([armed.id]);
    });

    it('asks nothing of the database for nobody', async () => {
        await expect(userService.staffContacts([])).resolves.toEqual([]);
    });
});
