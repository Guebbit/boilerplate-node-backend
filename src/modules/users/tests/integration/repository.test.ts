/**
 * @module
 * Integration coverage for `userRepository`, against the in-memory Mongo `setupTestDb` wires up.
 * Covers the CRUD surface from the repository factory plus the token-facing methods this module
 * adds on top of it.
 */

import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { makeUser, createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { userRepository } from '../../repository';
// The model directly: not exported from the barrel, since no sibling MODULE needs it there. A
// spec reaching its own module's internals is correct — `eslint-plugin-boundaries` allows exactly
// that.
import { userModel as Users } from '@modules/users/model';

setupTestDb();

describe('userRepository', () => {
    describe('create', () => {
        it('inserts a new user and returns the Mongoose document', async () => {
            const user = await userRepository.create(makeUser());

            expect(user._id).toBeDefined();
            expect(user.email).toBe('user@example.com');
            expect(user.username).toBe('testuser');
            // The pre-save hook hashes the password; we must NOT store plain text
            expect(user.password).not.toBe(PLAIN_PASSWORD);
        });
    });

    describe('findById', () => {
        it('returns the user document when the id exists', async () => {
            const created = await createUser();
            const id = created._id.toString();

            const found = await userRepository.findById(id);

            expect(found).not.toBeNull();
            expect(found!.email).toBe('user@example.com');
        });

        it('returns null when no document matches the id', async () => {
            // A syntactically valid but non-existent ObjectId
            const found = await userRepository.findById('000000000000000000000000');

            expect(found).toBeNull();
        });
    });

    describe('findOne', () => {
        it('returns a user that matches the query filter', async () => {
            await createUser({ email: 'unique@example.com' });

            const found = await userRepository.findOne({
                email: 'unique@example.com'
            });

            expect(found).not.toBeNull();
            expect(found!.email).toBe('unique@example.com');
        });

        it('returns null when no document matches', async () => {
            const found = await userRepository.findOne({
                email: 'nobody@example.com'
            });

            expect(found).toBeNull();
        });
    });

    describe('findAll', () => {
        it('returns all users when no filter is provided', async () => {
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });

            const users = await userRepository.findAll();

            expect(users).toHaveLength(2);
        });

        it('respects the limit option', async () => {
            for (let i = 0; i < 5; i++) {
                await createUser({ email: `u${i}@example.com`, username: `u${i}` });
            }

            const users = await userRepository.findAll({}, { limit: 2 });

            expect(users).toHaveLength(2);
        });

        it('respects the skip option for cursor-based pagination', async () => {
            // Three users; skip the first two → only one remains
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });
            await createUser({ email: 'c@example.com', username: 'c' });

            const users = await userRepository.findAll({}, { skip: 2, limit: 10 });

            expect(users).toHaveLength(1);
        });

        it('filters documents by the supplied query', async () => {
            await createUser({
                email: 'admin@example.com',
                username: 'admin',
                active: false
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                active: true
            });

            const deactivated = await userRepository.findAll({ active: false });

            expect(deactivated).toHaveLength(1);
            expect(deactivated[0].email).toBe('admin@example.com');
        });

        it('returns lean (plain JS) objects, not Mongoose Documents', async () => {
            await createUser();

            const [user] = await userRepository.findAll();

            // Lean objects have no Mongoose save() method
            expect(typeof asStub<{ save?: unknown }>(user).save).toBe('undefined');
        });
    });

    describe('count', () => {
        it('returns the total number of documents when no filter is given', async () => {
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });

            expect(await userRepository.count()).toBe(2);
        });

        it('counts only the documents that match the filter', async () => {
            await createUser({
                email: 'admin@example.com',
                username: 'admin',
                active: false
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                active: true
            });

            expect(await userRepository.count({ active: false })).toBe(1);
            expect(await userRepository.count({ active: true })).toBe(1);
        });

        it('returns 0 when the collection is empty', async () => {
            expect(await userRepository.count()).toBe(0);
        });
    });

    describe('save', () => {
        it('persists in-memory mutations to the database', async () => {
            const user = await createUser();
            const id = user._id.toString();

            // Mutate the Mongoose document in memory…
            user.username = 'updated-username';
            // …then flush it to the database
            await userRepository.save(user);

            const refreshed = await userRepository.findById(id);
            expect(refreshed!.username).toBe('updated-username');
        });
    });

    describe('deleteOne', () => {
        it('removes the document permanently from the database', async () => {
            const user = await createUser();
            const id = user._id.toString();

            await userRepository.deleteOne(user);

            expect(await userRepository.findById(id)).toBeNull();
        });
    });

    describe('updateMany', () => {
        it('applies the update to every document matching the filter', async () => {
            await createUser({ email: 'a@example.com', username: 'a', active: false });
            await createUser({ email: 'b@example.com', username: 'b', active: false });
            await createUser({ email: 'c@example.com', username: 'c', active: true });

            // Reactivate every deactivated account
            await userRepository.updateMany({ active: false }, { $set: { active: true } });

            expect(await userRepository.count({ active: true })).toBe(3);
            expect(await userRepository.count({ active: false })).toBe(0);
        });

        it('does not modify documents that do not match the filter', async () => {
            await createUser({
                email: 'admin@example.com',
                username: 'admin',
                active: false
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                active: true
            });

            // Only target the active account
            await userRepository.updateMany({ active: true }, { $set: { username: 'changed' } });

            const admin = await userRepository.findOne({
                email: 'admin@example.com'
            });
            expect(admin!.username).toBe('admin'); // unchanged
        });
    });

    describe('writebackImage', () => {
        const urls = {
            imageUrl: '/images/digested.png',
            thumbnailUrl: '/images/thumbs/v1/digested.webp'
        };

        it('writes the digested urls onto the document still waiting on this key', async () => {
            const created = await createUser();
            await Users.updateOne({ _id: created._id }, { pendingImageKey: 'key-1' });

            await expect(
                userRepository.writebackImage(String(created._id), 'key-1', urls)
            ).resolves.toBe(true);
        });

        it('answers true to a duplicate run of the same job, so its twin files are not deleted', async () => {
            const created = await createUser();
            await Users.updateOne({ _id: created._id }, { pendingImageKey: 'key-1' });
            await userRepository.writebackImage(String(created._id), 'key-1', urls);

            await expect(
                userRepository.writebackImage(String(created._id), 'key-1', urls)
            ).resolves.toBe(true);
        });

        it('answers false to a stale job whose document has moved on', async () => {
            const created = await createUser();
            await Users.updateOne({ _id: created._id }, { pendingImageKey: 'key-2' });

            await expect(
                userRepository.writebackImage(String(created._id), 'key-1', {
                    imageUrl: '/images/stale.png',
                    thumbnailUrl: '/images/thumbs/v1/stale.webp'
                })
            ).resolves.toBe(false);
        });
    });
});
