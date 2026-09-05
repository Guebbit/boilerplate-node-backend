/**
 * @module
 * Integration coverage for `userService` — validation, search, and the admin create/update/delete
 * flows — against the in-memory Mongo `setupTestDb` wires up.
 */

import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/fixtures';
import * as userService from '@modules/users/service';
import { userRepository, USER_SETUP_REQUESTED } from '@modules/users';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import type { UserDocument } from '@modules/users';

setupTestDb();

describe('userService.validateData', () => {
    it('returns an empty array for valid user data', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD
        });

        expect(errors).toHaveLength(0);
    });

    it('returns errors for an invalid email', () => {
        const errors = userService.validateData({
            email: 'not-an-email',
            username: 'validuser',
            password: PLAIN_PASSWORD
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('returns errors for a username that is too short', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'ab',
            password: PLAIN_PASSWORD
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it('does not require password when requirePassword is false', () => {
        const errors = userService.validateData(
            { email: 'valid@example.com', username: 'validuser' },
            false
        );

        expect(errors).toHaveLength(0);
    });

    /**
     * The fields a `.pick({ email, username, password })` would never look at. `admin` is the
     * costliest: an unchecked string reaches Mongoose and throws a CastError on save, so
     * `POST /users` answers 500 where its own contract promises 422.
     */
    it.each(['admin', 'active'])('rejects a wrong-typed %s flag', (field) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD,
            [field]: 'not-a-boolean'
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it.each([true, false])('accepts a real boolean admin flag (%s)', (admin) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD,
            admin
        });

        expect(errors).toHaveLength(0);
    });

    // The contract says `uri-reference`, not `uri`: an uploaded avatar is stored as a path
    // relative to the API host, so requiring an absolute URL here would reject every upload.
    it('accepts a server-relative upload path as the imageUrl', () => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD,
            imageUrl: '/uploads/1700000000-avatar.jpg'
        });

        expect(errors).toHaveLength(0);
    });

    // Not strict: a PUT body legitimately carries `id`, which is not part of the user schema.
    it('ignores body keys the schema does not declare', () => {
        const errors = userService.validateData({
            id: '65dc8a99604c307b702b5ccc',
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD
        });

        expect(errors).toHaveLength(0);
    });

    /**
     * A wrong i18n key is a user-visible bug the assertions above can't see: a missing key makes
     * i18next return the key itself, still a non-empty string. This asserts against the SHAPE of
     * a raw key — a dotted identifier, no spaces — so it keeps working when the copy is reworded.
     */
    it('returns translated messages, never raw i18n keys', () => {
        const errors = userService.validateData({
            email: 'not-an-email',
            username: 'ab',
            password: 'x'
        });

        expect(errors.length).toBeGreaterThan(0);
        // `message` is the copy; `details.field` names the input it belongs to, which is what a
        // form needs to highlight the right box rather than string-matching the sentence.
        for (const { message, details } of errors) {
            expect(message).not.toMatch(/^[a-z]+(?:\.[\da-z-]+)+$/);
            expect(details).toEqual({ field: expect.any(String) });
        }
    });
});

// Backs the three `active` filter cases below, built so the two facts DISAGREE: the deactivated
// account is not deleted, and the deleted account is still active.
const seedActiveAndDeleted = () =>
    Promise.all([
        createUser({ email: 'enabled@example.com', username: 'enabled', active: true }),
        createUser({ email: 'disabled@example.com', username: 'disabled', active: false }),
        createUser({
            email: 'deleted@example.com',
            username: 'deleted',
            active: true,
            deletedAt: new Date()
        })
    ]);

describe('userService.search', () => {
    it('returns all users with default pagination', async () => {
        await createUser({ email: 'a@example.com', username: 'a' });
        await createUser({ email: 'b@example.com', username: 'b' });

        const result = await userService.search({});

        expect(result.items).toHaveLength(2);
        expect(result.meta.totalItems).toBe(2);
    });

    it('filters by text (partial match on email or username)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await userService.search({ text: 'alice' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by email (case-insensitive partial match)', async () => {
        await createUser({ email: 'alice@example.com', username: 'alice' });
        await createUser({ email: 'bob@example.com', username: 'bob' });

        const result = await userService.search({ email: 'ALICE' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by username', async () => {
        await createUser({ email: 'a@example.com', username: 'alice' });
        await createUser({ email: 'b@example.com', username: 'bob' });

        const result = await userService.search({ username: 'bob' });

        expect(result.items).toHaveLength(1);
    });

    it('filters on the active column, not on soft-deletion', async () => {
        await seedActiveAndDeleted();

        const active = await userService.search({ active: true });

        // The deleted-but-active account is included: deletion is a separate fact, and this
        // filter does not ask about it.
        expect(active.items.map((item) => asStub<{ username: string }>(item).username)).toEqual(
            expect.arrayContaining(['enabled', 'deleted'])
        );
        expect(active.items).toHaveLength(2);
    });

    it('returns the deactivated account, and only it, for active: false', async () => {
        await seedActiveAndDeleted();

        const inactive = await userService.search({ active: false });

        expect(inactive.items).toHaveLength(1);
        expect(asStub<{ username: string }>(inactive.items[0]).username).toBe('disabled');
    });

    it('returns every account when active is not filtered on', async () => {
        await seedActiveAndDeleted();

        const all = await userService.search({});

        expect(all.items).toHaveLength(3);
    });

    it('paginates results correctly', async () => {
        for (let i = 0; i < 5; i++) {
            await createUser({ email: `u${i}@example.com`, username: `u${i}` });
        }

        const page1 = await userService.search({ page: 1, pageSize: 3 });
        const page2 = await userService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
    });

    it('returns correct meta when the collection is empty', async () => {
        const result = await userService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
        expect(result.meta.totalPages).toBe(0);
    });
});

describe('userService.getById', () => {
    it('returns a real document for an existing user', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const found = await userService.getById(id);

        expect(found).toBeDefined();
        expect(found!.email).toBe('user@example.com');
        // A real Mongoose document — schema's toJSON transform normalizes it on the way out
        expect(typeof asStub<{ save: unknown }>(found).save).toBe('function');
    });

    it('returns undefined for a non-existent id', async () => {
        const found = await userService.getById('000000000000000000000000');
        expect(found).toBeUndefined();
    });

    it('returns undefined when no id is provided', async () => {
        expect(await userService.getById(undefined)).toBeUndefined();
    });
});

describe('userService.create', () => {
    it('creates a user and returns the Mongoose document', async () => {
        const user = await userService.create(
            {
                email: 'created@example.com',
                username: 'createduser',
                password: PLAIN_PASSWORD
            },
            testCallerContext
        );

        expect(user._id).toBeDefined();
        expect(user.email).toBe('created@example.com');
        // Password should have been hashed by the pre-save hook
        expect(user.password).not.toBe(PLAIN_PASSWORD);
    });

    it('can create an admin user when admin flag is set', async () => {
        const user = await userService.create(
            {
                email: 'superadmin@example.com',
                username: 'superadmin',
                password: PLAIN_PASSWORD,
                admin: true
            },
            testCallerContext
        );

        expect(user.admin).toBe(true);
    });

    describe('with no password', () => {
        afterEach(() => {
            resetDomainEvents();
        });

        it('fills the field with something the caller was never told, rather than leaving it empty', async () => {
            // `password` is `required: true` at the Mongoose layer (see `./model`) regardless of
            // what the contract allows, so a create with no password still has to write SOMETHING.
            const user = await userService.create(
                { email: 'no-password@example.com', username: 'nopassworduser' },
                testCallerContext
            );

            const stored = await userRepository.findByIdWithCredentials(String(user._id));
            expect(stored?.password).toBeTruthy();
            expect(stored?.password).not.toBe('');
        });

        it('does not emit USER_SETUP_REQUESTED when sendSetupEmail is not set', async () => {
            const seen: string[] = [];
            onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
                seen.push(userId);
            });

            await userService.create(
                { email: 'no-setup@example.com', username: 'nosetupuser' },
                testCallerContext
            );

            expect(seen).toEqual([]);
        });

        it('emits USER_SETUP_REQUESTED for this user when sendSetupEmail is true', async () => {
            const seen: string[] = [];
            onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
                seen.push(userId);
            });

            const user = await userService.create(
                {
                    email: 'setup-me@example.com',
                    username: 'setupmeuser',
                    sendSetupEmail: true
                },
                testCallerContext
            );

            expect(seen).toEqual([String(user._id)]);
        });
    });

    it('never emits USER_SETUP_REQUESTED when a password was supplied, even with sendSetupEmail: true', async () => {
        const seen: string[] = [];
        onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
            seen.push(userId);
        });

        try {
            await userService.create(
                {
                    email: 'has-password@example.com',
                    username: 'haspassworduser',
                    password: PLAIN_PASSWORD,
                    sendSetupEmail: true
                },
                testCallerContext
            );

            expect(seen).toEqual([]);
        } finally {
            resetDomainEvents();
        }
    });
});

describe('userService.updateById', () => {
    it('updates the username and admin flag of an existing user', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            {
                username: 'new-name',
                admin: true
            },
            testCallerContext
        );

        expect(result.success).toBe(true);
        const updated = (result as { data: UserDocument }).data;
        expect(updated.username).toBe('new-name');
        expect(updated.admin).toBe(true);
    });

    it('changes the password when a non-empty password is supplied', async () => {
        const user = await createUser({ email: 'pwdupdate@example.com' });
        const id = user._id.toString();
        const originalHash = user.password;

        await userService.updateById(id, { password: REPLACEMENT_PASSWORD }, testCallerContext);

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.password).not.toBe(originalHash);
    });

    it('does not touch the password when an empty string is supplied', async () => {
        const user = await createUser();
        const id = user._id.toString();
        const originalHash = user.password;

        await userService.updateById(id, { password: '' }, testCallerContext);

        const refreshed = await userRepository.findByIdWithCredentials(id);
        expect(refreshed!.password).toBe(originalHash);
    });

    it('returns reject result when the user does not exist', async () => {
        const result = await userService.updateById(
            '000000000000000000000000',
            { username: 'x' },
            testCallerContext
        );
        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('actually deactivates the account, not just the USER_DEACTIVATED event', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(id, { active: false }, testCallerContext);

        expect(result.success).toBe(true);
        expect((result as { data: UserDocument }).data.active).toBe(false);
        const refreshed = await userRepository.findById(id);
        expect(refreshed!.active).toBe(false);
    });

    it('persists a locale change, the same as at creation', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(id, { locale: 'fr' }, testCallerContext);

        expect(result.success).toBe(true);
        expect((result as { data: UserDocument }).data.locale).toBe('fr');
    });
});

describe('userService.update', () => {
    it('updates an existing user document directly', async () => {
        const user = await createUser();

        const result = await userService.update(user, { username: 'direct-update' });

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data!.username).toBe('direct-update');
    });
});

describe('userService.removeById', () => {
    it('soft-deletes a user by setting deletedAt', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.removeById(id);

        expect(result.success).toBe(true);
        const updated = await userRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('restores a soft-deleted user when called again (toggle)', async () => {
        const user = await createUser({ deletedAt: new Date() });
        const id = user._id.toString();

        await userService.removeById(id);

        const restored = await userRepository.findById(id);
        expect(restored!.deletedAt).toBeUndefined();
    });

    it('hard-deletes a user when hardDelete is true', async () => {
        const user = await createUser();
        const id = user._id.toString();

        await userService.removeById(id, true);

        expect(await userRepository.findById(id)).toBeNull();
    });

    it('returns a 404 rejection when the user does not exist', async () => {
        const result = await userService.removeById('000000000000000000000000');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(404);
    });
});

describe('userService.remove', () => {
    it('soft-deletes a user document directly', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.remove(user);

        expect(result.success).toBe(true);
        const updated = await userRepository.findById(id);
        expect(updated!.deletedAt).toBeDefined();
    });

    it('hard-deletes a user document directly', async () => {
        const user = await createUser();
        const id = user._id.toString();

        await userService.remove(user, true);

        expect(await userRepository.findById(id)).toBeNull();
    });
});
