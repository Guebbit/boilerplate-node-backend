/**
 * UserRepository – Integration tests
 *
 * What is tested here?
 * --------------------
 * Every method exported from src/repositories/users.ts is exercised against a
 * real (in-memory) MongoDB instance.  No mocks are used for the database layer;
 * the repository code runs exactly as it would in production, so a bug in a
 * Mongoose query will surface here rather than slipping through a mock.
 *
 * Test isolation
 * --------------
 * `beforeEach(clearAll)` deletes every document from every collection before
 * each test.  Each test therefore builds the exact state it needs from scratch
 * and is completely independent of every other test in this file.
 *
 * Factory usage
 * -------------
 * `createUser()` inserts a document via UserRepository.create() so the Mongoose
 * pre-save hook (password hashing) fires.  `makeUser()` returns a plain object
 * for callers that want to call the repository directly.
 */

import { connect, disconnect, clearAll } from '../../helpers/database';
import { makeUser, createUser } from '../../helpers/factories/users';
import * as UserRepository from '@repositories/users';
import type { IUserDocument } from '@models/users';
import { Types } from 'mongoose';

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(connect);    // start in-memory MongoDB once for this file
afterAll(disconnect);  // tear it down when the suite finishes
beforeEach(clearAll);  // empty every collection before each test

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UserRepository', () => {

    // ── create ────────────────────────────────────────────────────────────────

    describe('create', () => {
        it('inserts a new user and returns the Mongoose document', async () => {
            const user = await UserRepository.create(makeUser() as Partial<IUserDocument>);

            expect(user._id).toBeDefined();
            expect(user.email).toBe('user@example.com');
            expect(user.username).toBe('testuser');
            // The pre-save hook hashes the password; we must NOT store plain text
            expect(user.password).not.toBe('Password1!');
        });

        it('sets admin to false by default', async () => {
            const user = await UserRepository.create(makeUser() as Partial<IUserDocument>);

            expect(user.admin).toBe(false);
        });
    });

    // ── findById ──────────────────────────────────────────────────────────────

    describe('findById', () => {
        it('returns the user document when the id exists', async () => {
            const created = await createUser();
            const id = (created._id as Types.ObjectId).toString();

            const found = await UserRepository.findById(id);

            expect(found).not.toBeNull();
            expect(found!.email).toBe('user@example.com');
        });

        it('returns null when no document matches the id', async () => {
            // A syntactically valid but non-existent ObjectId
            const found = await UserRepository.findById('000000000000000000000000');

            expect(found).toBeNull();
        });
    });

    // ── findOne ───────────────────────────────────────────────────────────────

    describe('findOne', () => {
        it('returns a user that matches the query filter', async () => {
            await createUser({ email: 'unique@example.com' });

            const found = await UserRepository.findOne({ email: 'unique@example.com' });

            expect(found).not.toBeNull();
            expect(found!.email).toBe('unique@example.com');
        });

        it('returns null when no document matches', async () => {
            const found = await UserRepository.findOne({ email: 'nobody@example.com' });

            expect(found).toBeNull();
        });
    });

    // ── findAll ───────────────────────────────────────────────────────────────

    describe('findAll', () => {
        it('returns all users when no filter is provided', async () => {
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });

            const users = await UserRepository.findAll();

            expect(users).toHaveLength(2);
        });

        it('respects the limit option', async () => {
            for (let i = 0; i < 5; i++) {
                await createUser({ email: `u${i}@example.com`, username: `u${i}` });
            }

            const users = await UserRepository.findAll({}, { limit: 2 });

            expect(users).toHaveLength(2);
        });

        it('respects the skip option for cursor-based pagination', async () => {
            // Three users; skip the first two → only one remains
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });
            await createUser({ email: 'c@example.com', username: 'c' });

            const users = await UserRepository.findAll({}, { skip: 2, limit: 10 });

            expect(users).toHaveLength(1);
        });

        it('filters documents by the supplied query', async () => {
            await createUser({ email: 'admin@example.com', username: 'admin', admin: true });
            await createUser({ email: 'user@example.com', username: 'user', admin: false });

            const admins = await UserRepository.findAll({ admin: true });

            expect(admins).toHaveLength(1);
            expect(admins[0].email).toBe('admin@example.com');
        });

        it('returns lean (plain JS) objects, not Mongoose Documents', async () => {
            await createUser();

            const [user] = await UserRepository.findAll();

            // Lean objects have no Mongoose save() method
            expect(typeof (user as unknown as { save?: unknown }).save).toBe('undefined');
        });
    });

    // ── count ─────────────────────────────────────────────────────────────────

    describe('count', () => {
        it('returns the total number of documents when no filter is given', async () => {
            await createUser({ email: 'a@example.com', username: 'a' });
            await createUser({ email: 'b@example.com', username: 'b' });

            expect(await UserRepository.count()).toBe(2);
        });

        it('counts only the documents that match the filter', async () => {
            await createUser({ email: 'admin@example.com', username: 'admin', admin: true });
            await createUser({ email: 'user@example.com', username: 'user', admin: false });

            expect(await UserRepository.count({ admin: true })).toBe(1);
            expect(await UserRepository.count({ admin: false })).toBe(1);
        });

        it('returns 0 when the collection is empty', async () => {
            expect(await UserRepository.count()).toBe(0);
        });
    });

    // ── save ──────────────────────────────────────────────────────────────────

    describe('save', () => {
        it('persists in-memory mutations to the database', async () => {
            const user = await createUser();
            const id = (user._id as Types.ObjectId).toString();

            // Mutate the Mongoose document in memory…
            user.username = 'updated-username';
            // …then flush it to the database
            await UserRepository.save(user);

            const refreshed = await UserRepository.findById(id);
            expect(refreshed!.username).toBe('updated-username');
        });
    });

    // ── deleteOne ─────────────────────────────────────────────────────────────

    describe('deleteOne', () => {
        it('removes the document permanently from the database', async () => {
            const user = await createUser();
            const id = (user._id as Types.ObjectId).toString();

            await UserRepository.deleteOne(user);

            expect(await UserRepository.findById(id)).toBeNull();
        });
    });

    // ── updateMany ────────────────────────────────────────────────────────────

    describe('updateMany', () => {
        it('applies the update to every document matching the filter', async () => {
            await createUser({ email: 'a@example.com', username: 'a', admin: false });
            await createUser({ email: 'b@example.com', username: 'b', admin: false });
            await createUser({ email: 'c@example.com', username: 'c', admin: true });

            // Promote all non-admins
            await UserRepository.updateMany({ admin: false }, { $set: { admin: true } });

            expect(await UserRepository.count({ admin: true })).toBe(3);
            expect(await UserRepository.count({ admin: false })).toBe(0);
        });

        it('does not modify documents that do not match the filter', async () => {
            await createUser({ email: 'admin@example.com', username: 'admin', admin: true });
            await createUser({ email: 'user@example.com', username: 'user', admin: false });

            // Only target the non-admin
            await UserRepository.updateMany({ admin: false }, { $set: { username: 'changed' } });

            const admin = await UserRepository.findOne({ email: 'admin@example.com' });
            expect(admin!.username).toBe('admin'); // unchanged
        });
    });
});
