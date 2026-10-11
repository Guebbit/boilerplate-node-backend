/**
 * @module
 * The authenticatable specification: its Mongo filter and its predicate answer alike on all four
 * states (enabled or banned, live or soft-deleted), against a real database. A path that queries
 * and a path that checks an already-loaded account must never disagree.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { AUTHENTICATABLE_FILTER, isAuthenticatable } from '../../authenticatable';

setupTestDb();

/** Every combination of the two flags, with whether an account in it may authenticate. */
const STATES = [
    { name: 'enabled and live', overrides: {}, authenticatable: true },
    { name: 'banned', overrides: { active: false }, authenticatable: false },
    { name: 'soft-deleted', overrides: { deletedAt: new Date() }, authenticatable: false },
    {
        name: 'banned and soft-deleted',
        overrides: { active: false, deletedAt: new Date() },
        authenticatable: false
    }
] as const;

describe('AUTHENTICATABLE_FILTER and isAuthenticatable', () => {
    it.each(STATES)(
        'agree that an account that is $name is authenticatable: $authenticatable',
        async ({ name, overrides, authenticatable }) => {
            const user = await createUser({
                email: `${name.replaceAll(' ', '-')}@example.com`,
                username: name,
                ...overrides
            });

            const matched = await userRepository.count({ _id: user.id, ...AUTHENTICATABLE_FILTER });

            expect(isAuthenticatable(user)).toBe(authenticatable);
            expect(matched === 1).toBe(authenticatable);
        }
    );

    it('treats an explicit null deletedAt like a missing one', async () => {
        const user = await createUser({ email: 'null-deleted@example.com' });
        await userRepository.updateMany({ _id: user.id }, { $set: { deletedAt: null } });

        expect(await userRepository.count({ _id: user.id, ...AUTHENTICATABLE_FILTER })).toBe(1);
    });
});

/** A provider link entry for `providerId` on Google. */
const googleEntry = (providerId: string) => ({
    provider: 'google',
    providerId,
    connectedAt: new Date()
});

describe('linkOAuthAccount', () => {
    it('reports whether it wrote, and writes one entry per provider', async () => {
        const user = await createUser({ email: 'link-once@example.com' });

        const first = await userRepository.linkOAuthAccount(user.id, googleEntry('a'));
        const second = await userRepository.linkOAuthAccount(user.id, googleEntry('b'));

        expect([first, second]).toEqual([true, false]);
        const stored = await userRepository.findByIdWithCredentials(user.id);
        expect(stored?.oauthAccounts).toHaveLength(1);
    });
});
