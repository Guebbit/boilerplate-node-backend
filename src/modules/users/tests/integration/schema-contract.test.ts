/**
 * Schema contract — the declarations themselves, not the transforms.
 *
 * The sibling specs in this folder cover behaviour; this covers what the SCHEMA says, which is
 * equally part of the API and is not exercised anywhere else:
 *
 *   **Defaults** decide what a client gets for a field it never sent. A row created without a
 *   flag is visible or invisible depending on one word in the schema, and nothing else pins which.
 *
 *   **`required`** is the only thing standing between a malformed write and a persisted row that
 *   later breaks every reader. Asserted per field, since each is an independent one-line flag.
 *
 *   **`select: false`** on credentials is why they do not leak from an ordinary read.
 *
 * Real Mongo, because these are Mongoose's behaviours rather than ours: a mocked model would
 * assert the mock's opinion of what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { userRepository } from '@modules/users';
import { createUser } from '@modules/users/tests/fixtures';

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

        expect(found!.password).not.toBe('Password1!');
        // bcrypt output, not a plain string that merely differs.
        expect(found!.password).toMatch(/^\$2[aby]\$/);
    });

    it('defaults admin to false', async () => {
        const user = await userRepository.create({
            email: 'plain@example.com',
            username: 'plain',
            password: 'Password1!'
        } as never);

        // Privilege by omission would be the worst possible default here.
        expect(user.admin).toBe(false);
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
     * `email` is unique at the DATABASE level, and this is the case that says so.
     *
     * The application check in `authService.signup` (`findOne({ email })` → 409) is not enough on
     * its own, and cannot be: it is not atomic. Two concurrent signups for one address both pass
     * the lookup and both insert, and `login` then resolves to whichever document Mongo returns
     * first, which can change between requests.
     *
     * No application-level check can close that, because the gap is between the check and the
     * write. The index is what refuses the second insert.
     * `tests/integration/concurrency/auth-races.test.ts` drives the race itself; this case pins
     * the constraint the race relies on, so a schema edit that quietly drops `unique` fails here
     * rather than in a timing-dependent test.
     */
    it('enforces email uniqueness at the database level', async () => {
        await createUser({ email: 'duplicate@example.com' });

        await expect(createUser({ email: 'duplicate@example.com' })).rejects.toThrow(
            /e11000|duplicate key/i
        );
    });
});
