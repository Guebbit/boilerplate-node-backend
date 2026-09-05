/**
 * @module
 * Schema contract — the declarations themselves, not the transforms: defaults, `required`, and
 * `select: false` on credentials. Runs against real Mongo, since these are Mongoose's own
 * behaviours rather than ours — a mocked model would only assert the mock's opinion of `default`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { userRepository } from '@modules/users';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';

setupTestDb();

describe('user schema', () => {
    it('hides password and tokens from an ordinary read', async () => {
        const created = await createUser({ email: 'hidden@example.com' });

        const found = await userRepository.findById(created.id);

        // `select: false`: a plain findById must not be able to hand a caller credentials.
        expect(found!.password).toBeUndefined();
        // Undefined rather than an empty array: the field was never selected, which is a
        // stronger guarantee than "selected but blank" — there is nothing to accidentally
        // serialise.
        expect(found!.tokens).toBeUndefined();
    });

    it('exposes credentials only through the explicit selector', async () => {
        const created = await createUser({ email: 'explicit@example.com' });

        const found = await userRepository.findByIdWithCredentials(created.id);

        expect(found!.password).toEqual(expect.any(String));
    });

    it('hashes the password rather than storing it verbatim', async () => {
        const created = await createUser({ email: 'hash@example.com' });

        const found = await userRepository.findByIdWithCredentials(created.id);

        expect(found!.password).not.toBe(PLAIN_PASSWORD);
        // bcrypt output, not a plain string that merely differs.
        expect(found!.password).toMatch(/^\$2[aby]\$/);
    });

    it('serialises to id, never _id, __v, password or tokens', async () => {
        const created = await createUser({ email: 'json@example.com' });

        const serialized = created.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(created._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
        expect(serialized).not.toHaveProperty('password');
        expect(serialized).not.toHaveProperty('tokens');
    });

    /**
     * `email` is unique at the DATABASE level — this pins the constraint a concurrency race
     * relies on. The application check in `authService.signup` (`findOne` → 409) isn't atomic:
     * two concurrent signups for one address can both pass the lookup and both insert, so only
     * the index can refuse the second write.
     * `tests/integration/concurrency/auth-races.test.ts` drives the race itself; this case fails
     * fast if a schema edit quietly drops `unique`.
     */
    it('enforces email uniqueness at the database level', async () => {
        await createUser({ email: 'duplicate@example.com' });

        await expect(createUser({ email: 'duplicate@example.com' })).rejects.toThrow(
            /e11000|duplicate key/i
        );
    });
});
