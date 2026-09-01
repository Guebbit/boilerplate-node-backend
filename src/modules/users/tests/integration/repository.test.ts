/**
 * @module
 * Integration coverage for `userRepository`, against the in-memory Mongo `setupTestDb` wires up.
 * Covers the CRUD surface from the repository factory plus the token-facing methods this module
 * adds on top of it.
 */

import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { makeUser, createUser } from '@modules/users/tests/fixtures';
import { userRepository, hashToken } from '@modules/users';
import { TokenType, type UserDocument } from '@modules/users';
// The model directly: it is no longer on the barrel, because no sibling MODULE needs it. A spec
// reaching its own module's internals is correct — `eslint-plugin-boundaries` allows exactly that.
import { userModel as Users } from '@modules/users/model';

setupTestDb();

describe('userRepository', () => {
    describe('create', () => {
        it('inserts a new user and returns the Mongoose document', async () => {
            const user = await userRepository.create(makeUser() as Partial<UserDocument>);

            expect(user._id).toBeDefined();
            expect(user.email).toBe('user@example.com');
            expect(user.username).toBe('testuser');
            // The pre-save hook hashes the password; we must NOT store plain text
            expect(user.password).not.toBe('Password1!');
        });

        it('sets admin to false by default', async () => {
            const user = await userRepository.create(makeUser() as Partial<UserDocument>);

            expect(user.admin).toBe(false);
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
                admin: true
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                admin: false
            });

            const admins = await userRepository.findAll({ admin: true });

            expect(admins).toHaveLength(1);
            expect(admins[0].email).toBe('admin@example.com');
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
                admin: true
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                admin: false
            });

            expect(await userRepository.count({ admin: true })).toBe(1);
            expect(await userRepository.count({ admin: false })).toBe(1);
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
            await createUser({ email: 'a@example.com', username: 'a', admin: false });
            await createUser({ email: 'b@example.com', username: 'b', admin: false });
            await createUser({ email: 'c@example.com', username: 'c', admin: true });

            // Promote all non-admins
            await userRepository.updateMany({ admin: false }, { $set: { admin: true } });

            expect(await userRepository.count({ admin: true })).toBe(3);
            expect(await userRepository.count({ admin: false })).toBe(0);
        });

        it('does not modify documents that do not match the filter', async () => {
            await createUser({
                email: 'admin@example.com',
                username: 'admin',
                admin: true
            });
            await createUser({
                email: 'user@example.com',
                username: 'user',
                admin: false
            });

            // Only target the non-admin
            await userRepository.updateMany({ admin: false }, { $set: { username: 'changed' } });

            const admin = await userRepository.findOne({
                email: 'admin@example.com'
            });
            expect(admin!.username).toBe('admin'); // unchanged
        });
    });

    // Every fixture below seeds `tokens` directly rather than through `tokenAdd`, so it stores
    // `hashToken(...)` explicitly — BETTER_SECURITY.md wave 3.1 hashes at rest, and a plaintext
    // seed here would describe a document production never actually writes.
    describe('token methods', () => {
        it('tokenRemoveAll removes all tokens of the selected type', async () => {
            const user = await createUser({
                tokens: [
                    {
                        type: TokenType.REFRESH,
                        token: hashToken('refresh-1'),
                        expiration: new Date(Date.now() + 60_000)
                    },
                    {
                        type: TokenType.REFRESH,
                        token: hashToken('refresh-2'),
                        expiration: new Date(Date.now() + 120_000)
                    },
                    {
                        type: TokenType.PASSWORD_RESET,
                        token: hashToken('password-1'),
                        expiration: new Date(Date.now() + 120_000)
                    }
                ]
            });

            await user.tokenRemoveAll(TokenType.REFRESH);
            const refreshed = await userRepository.findByIdWithCredentials(user._id.toString());

            expect(refreshed).not.toBeNull();
            expect(refreshed!.tokens).toHaveLength(1);
            expect(refreshed!.tokens[0].type).toBe(TokenType.PASSWORD_RESET);
        });

        it('tokenRemoveExpired removes expired tokens and keeps valid ones', async () => {
            const expired = new Date(Date.now() - 60_000);
            const futureExpiration = new Date(Date.now() + 60_000);

            const user = await createUser({
                tokens: [
                    {
                        type: TokenType.REFRESH,
                        token: hashToken('expired-token'),
                        expiration: expired
                    },
                    {
                        type: TokenType.REFRESH,
                        token: hashToken('valid-token'),
                        expiration: futureExpiration
                    }
                ]
            });

            const removed = await userRepository.tokenRemoveExpired();
            const refreshed = await userRepository.findByIdWithCredentials(user._id.toString());

            // A count, not a status code: what a failed sweep means to a client is the service's
            // decision, and this layer no longer has an opinion about it.
            expect(removed).toBe(1);
            expect(refreshed).not.toBeNull();
            expect(refreshed!.tokens).toHaveLength(1);
            expect(refreshed!.tokens[0].token).toBe(hashToken('valid-token'));
        });

        it('tokenRemoveExpired rejects when the write fails, rather than inventing a status', async () => {
            // The double must be a QUERY, not a promise: the repository calls
            // `updateMany(...).exec()`, so `mockRejectedValue` here would fail with
            // "exec is not a function" instead of exercising the path under test.
            const updateManySpy = jest.spyOn(Users, 'updateMany').mockReturnValueOnce({
                exec: () => Promise.reject(new Error('db failure'))
            } as never);

            /*
             * It used to resolve `{ status: 500, success: false }` — a Mongoose static choosing an
             * HTTP status code. Rejecting is what lets `adminTokenCleanup` decide that, and what
             * stops a caller mistaking a failed sweep for an empty one.
             */
            await expect(userRepository.tokenRemoveExpired()).rejects.toThrow('db failure');
            updateManySpy.mockRestore();
        });

        // These are the two lookups the session layer runs, asserted here because that's a
        // persistence fact — `account/session/jwt.ts` used to issue them itself and assert
        // their shape against a mock's call log instead of a real document.
        it('findByTokenValue finds the holder whatever kind the token is', async () => {
            const user = await createUser({
                tokens: [
                    { type: TokenType.REFRESH, token: hashToken('session-token') },
                    { type: TokenType.PASSWORD_RESET, token: hashToken('reset-token') }
                ]
            });

            // `findByTokenValue` takes the PLAINTEXT and hashes it internally — untyped by
            // design: the refresh flow's question is "does this credential still exist on a
            // document", and the JWT itself carries no type to narrow by.
            await expect(userRepository.findByTokenValue('session-token')).resolves.toMatchObject({
                _id: user._id
            });
            await expect(userRepository.findByTokenValue('reset-token')).resolves.toMatchObject({
                _id: user._id
            });
            await expect(userRepository.findByTokenValue('never-issued')).resolves.toBeNull();
        });

        it('tokenTouch stamps the token that matched, not the first in the array', async () => {
            const user = await createUser({
                tokens: [
                    { type: TokenType.REFRESH, token: hashToken('first-session') },
                    { type: TokenType.REFRESH, token: hashToken('second-session') }
                ]
            });

            // `tokenTouch` takes the PLAINTEXT and hashes it internally, same as `findByTokenValue`.
            await userRepository.tokenTouch('second-session');
            const refreshed = await userRepository.findByIdWithCredentials(user._id.toString());
            const byValue = (value: string) =>
                refreshed!.tokens.find(({ token }) => token === hashToken(value));

            // This is what the positional `$` buys: without it the stamp lands on `tokens.0` and
            // every session in `GET /account/sessions` reports the wrong last-used time.
            expect(byValue('second-session')!.lastUsedAt).toBeInstanceOf(Date);
            expect(byValue('first-session')!.lastUsedAt).toBeUndefined();
        });
    });
});
