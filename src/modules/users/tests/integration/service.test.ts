/**
 * @module
 * Integration coverage for `userService` — validation, search, and the admin create/update/delete
 * flows — against the in-memory Mongo `setupTestDb` wires up.
 */

import { asStub } from '@tests/stub';
import { observePort } from '@tests/ports';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext, callerContextAs } from '@tests/callers';
import { systemCallerContext } from '@kernel/permissions';
import type { ClientSession } from 'mongoose';
import { personalDataErasers, setPersonalDataErasers } from '../../erasure-registry';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import * as userService from '@modules/users/services';
import { USER_SETUP_REQUESTED } from '../../events';
import { userRepository } from '../../repository';
import { usersAuditActions } from '@modules/users/audit';
import * as auditPort from '@infrastructure/observability/audit';
import * as analyticsPort from '@infrastructure/observability/analytics';
import { usersAnalyticsEvents } from '../../analytics';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { assignRole, membershipsOf, rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { presentUser } from '../../presenter';
import type { UserDocument } from '../../model';

// See `tests/support/ports.ts`: the namespace import above must resolve a plain `jest.fn()`,
// not the real (non-configurable) export, for `observePort` to be able to clear and hand it out.
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the
        // override above — reroute it through the replacement so a spy on `emitAuditEvent` still
        // sees every `recordAudit` call, exactly as it saw every direct one before.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

/**
 * Mock the image store, not the filesystem underneath it — same reasoning as
 * `products/tests/integration/service.test.ts`: the service owes its collaborator only a
 * *stored-image handle* (`imageUrl`).
 */
// Same reason as the audit port above: `observePort` needs a plain `jest.fn()` to hand out.
jest.mock('@infrastructure/observability/analytics', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/analytics'),
    emitAnalyticsEvent: jest.fn()
}));
jest.mock('@infrastructure/adapters/image-store', () => ({
    // `applyImageWriteback` is a pure mutation the tests below rely on for real — only the
    // filesystem-touching `remove` half needs stubbing.
    ...jest.requireActual('@infrastructure/adapters/image-store'),
    imageStore: { remove: jest.fn().mockResolvedValue(true) }
}));

const { imageStore } = jest.requireMock<{ imageStore: { remove: jest.Mock } }>(
    '@infrastructure/adapters/image-store'
);

setupTestDb();

/**
 * Awaits `userService.create`, asserts the envelope succeeded, and returns the created document —
 * every case in `describe('userService.create', ...)` bar the breach one expects success, so
 * unwrapping here keeps each test one assertion shorter.
 */
const expectCreated = async (
    ...args: Parameters<typeof userService.create>
): Promise<UserDocument> => {
    const result = await userService.create(...args);
    expect(result.success).toBe(true);
    return (result as ResponseSuccess<UserDocument>).data;
};

/** Validates an otherwise valid create body that carries only the given `imageUrl`. */
const withImage = (imageUrl: string | null) =>
    userService.validateData({
        email: 'valid@example.com',
        username: 'validuser',
        password: PLAIN_PASSWORD,
        imageUrl
    });

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
     * The fields a `.pick({ email, username, password })` would never look at. `active` is the
     * costliest: an unchecked string reaches Mongoose and throws a CastError on save, so
     * `POST /users` answers 500 where its own contract promises 422.
     */
    it.each(['active'])('rejects a wrong-typed %s flag', (field) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD,
            [field]: 'not-a-boolean'
        });

        expect(errors.length).toBeGreaterThan(0);
    });

    it.each(['admin', 'customer', 'manager'])('accepts a declared role name (%s)', (role) => {
        const errors = userService.validateData({
            email: 'valid@example.com',
            username: 'validuser',
            password: PLAIN_PASSWORD,
            role
        });

        expect(errors).toHaveLength(0);
    });

    // A client never names a path in the image store — it can only remove one with `null`.
    it('refuses a path as the imageUrl, and accepts null', () => {
        expect(withImage('/uploads/1700000000-avatar.jpg')).toHaveLength(1);
        expect(withImage(null)).toHaveLength(0);
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

    it('decrypts phone through presentUser on a lean/searched item, the same as a hydrated one', async () => {
        const user = await createUser({ email: 'phoned@example.com', username: 'phoned' });
        await userService.updateById(
            user._id.toString(),
            { phone: '+1 555 0100' },
            callerContextAs('admin')
        );

        // `search()` is the `.lean()` path (`create-repository.ts#findAll`) — unlike every other
        // read in this suite, `presentUser` receives a plain object here, not a hydrated document.
        const result = await userService.search({ username: 'phoned' });
        expect(presentUser(result.items[0], null).phone).toBe('+1 555 0100');
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
        // `callerContextAs('admin')`, not `testCallerContext`: `create` always grants a
        // membership now (the implicit `customer` default included), and an anonymous granter
        // cannot grant anything — same invariant a real route guard would already have enforced.
        const user = await expectCreated(
            {
                email: 'created@example.com',
                username: 'createduser'
            },
            callerContextAs('admin')
        );

        expect(user._id).toBeDefined();
        expect(user.email).toBe('created@example.com');
    });

    it('creates a user in the role the request names', async () => {
        const user = await expectCreated(
            {
                email: 'superadmin@example.com',
                username: 'superadmin',
                role: 'admin'
            },
            callerContextAs('admin')
        );

        // The membership, not a document field — `create` grants it through `assignRole`.
        const roles = await rolesOf(String(user._id), DEPLOYMENT_TENANT_ID);
        expect(roles.tenant).toBe('admin');
    });

    it('lets a moderator create a user in the default role, despite lacking its own self keys', async () => {
        // `moderator` holds none of `customer`'s keys — `users.any.create` is the one thing that
        // makes handing out the account's OWN starting role not an escalation.
        const user = await expectCreated(
            {
                email: 'moderator-made@example.com',
                username: 'moderatormade'
            },
            callerContextAs('moderator')
        );

        const roles = await rolesOf(String(user._id), DEPLOYMENT_TENANT_ID);
        expect(roles.tenant).toBe('customer');
    });

    it('deletes the orphan row when the requested role is an escalation the caller cannot grant', async () => {
        // `moderator` can create accounts but cannot grant `admin` — before the fix this wrote
        // the user row, THEN refused the grant, leaving a document with no membership at all and
        // the email permanently unusable for a retry.
        await expect(
            userService.create(
                {
                    email: 'never-created@example.com',
                    username: 'nevercreated',
                    role: 'admin'
                },
                callerContextAs('moderator')
            )
        ).rejects.toThrow();

        expect(await userRepository.findOne({ email: 'never-created@example.com' })).toBeNull();
    });

    describe('the owner chooses the password', () => {
        afterEach(() => {
            resetDomainEvents();
        });

        it('fills the field with something the caller was never told, rather than leaving it empty', async () => {
            // `password` is `required: true` at the Mongoose layer (see `./model`), so a create
            // still has to write SOMETHING; nobody is told what.
            const user = await expectCreated(
                { email: 'no-password@example.com', username: 'nopassworduser' },
                callerContextAs('admin')
            );

            const stored = await userRepository.findByIdWithCredentials(String(user._id));
            expect(stored?.password).toBeTruthy();
            expect(stored?.password).not.toBe('');
        });

        it('gives two accounts two different unknown passwords', async () => {
            const first = await expectCreated(
                { email: 'unknown-one@example.com', username: 'unknownone' },
                callerContextAs('admin')
            );
            const second = await expectCreated(
                { email: 'unknown-two@example.com', username: 'unknowntwo' },
                callerContextAs('admin')
            );

            const [one, two] = await Promise.all([
                userRepository.findByIdWithCredentials(String(first._id)),
                userRepository.findByIdWithCredentials(String(second._id))
            ]);
            expect(one?.password).not.toBe(two?.password);
        });

        it('emits USER_SETUP_REQUESTED for this user, always', async () => {
            const seen: string[] = [];
            onDomainEvent(USER_SETUP_REQUESTED, ({ userId }) => {
                seen.push(userId);
            });

            const user = await expectCreated(
                { email: 'setup-me@example.com', username: 'setupmeuser' },
                callerContextAs('admin')
            );

            expect(seen).toEqual([String(user._id)]);
        });
    });
});

describe('userService.updateById', () => {
    it('updates the username and role of an existing user', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            {
                username: 'new-name',
                role: 'admin'
            },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        const updated = (result as { data: UserDocument }).data;
        expect(updated.username).toBe('new-name');
        const roles = await rolesOf(String(updated._id), DEPLOYMENT_TENANT_ID);
        expect(roles.tenant).toBe('admin');
    });

    it('stores phone encrypted, never as the plaintext submitted, and decrypts it back through presentUser', async () => {
        const user = await createUser();
        const id = user._id.toString();

        await userService.updateById(id, { phone: '+1 555 0100' }, callerContextAs('admin'));

        // Bypasses `presentUser` on purpose — this is what a raw DB read, or a stolen disk/backup,
        // would actually see.
        const stored = await userRepository.findById(id);
        expect(stored!.phone).not.toBe('+1 555 0100');
        // Versioned-secret's own wire format — see infrastructure/security/versioned-secret.ts.
        expect(stored!.phone).toMatch(/^v\d+(?::[\da-f]+){3}$/);

        expect(presentUser(stored!, null).phone).toBe('+1 555 0100');
    });

    it('refuses a phone ciphertext copied onto another account: the user id is in the AAD', async () => {
        const owner = await createUser();
        const other = await createUser({ email: 'other@example.com', username: 'other' });
        await userService.updateById(
            owner._id.toString(),
            { phone: '+1 555 0100' },
            callerContextAs('admin')
        );
        const stored = await userRepository.findById(owner._id.toString());
        const victim = await userRepository.findById(other._id.toString());
        // What an attacker with database write access does: paste one row's ciphertext on another.
        victim!.phone = stored!.phone;

        expect(() => presentUser(victim!, null)).toThrow();
    });

    it('returns reject result when the user does not exist', async () => {
        const result = await userService.updateById(
            '000000000000000000000000',
            { username: 'x' },
            callerContextAs('admin')
        );
        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('updates the imageUrl and removes the old avatar from the store', async () => {
        const user = await createUser({ imageUrl: '/images/old-avatar.jpg' });
        const id = user._id.toString();

        await userService.updateById(
            id,
            { imageUrl: '/images/new-avatar.jpg' },
            callerContextAs('admin')
        );

        // The OLD avatar goes, and it goes by its stored url — see `products`' identical case.
        expect(imageStore.remove).toHaveBeenCalledWith('/images/old-avatar.jpg');
        expect(imageStore.remove).not.toHaveBeenCalledWith('/images/new-avatar.jpg');
    });

    /* The avatar is only replaced when a new one arrives; every other edit must leave it alone. */
    it('keeps the avatar when an update carries no imageUrl', async () => {
        const user = await createUser({ imageUrl: '/images/keep-avatar.jpg' });
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            { username: 'renamed-once-more' },
            callerContextAs('admin')
        );

        expect(imageStore.remove).not.toHaveBeenCalled();
        expect((result as { data: UserDocument }).data.imageUrl).toBe('/images/keep-avatar.jpg');
    });

    /*
     * `data.imageUrl !== undefined` is never a safe "was a new image uploaded" check — an
     * empty string reaching the service must keep the stored avatar, the same as an absent one.
     */
    it('keeps the avatar when an update carries an empty-string imageUrl', async () => {
        const user = await createUser({ imageUrl: '/images/keep-avatar.jpg' });
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            { username: 'renamed-empty-image', imageUrl: '' },
            callerContextAs('admin')
        );

        expect(imageStore.remove).not.toHaveBeenCalled();
        expect((result as { data: UserDocument }).data.imageUrl).toBe('/images/keep-avatar.jpg');
    });

    /* Re-submitting the same url is not a replacement — deleting here would delete the live avatar. */
    it('keeps the avatar when the update repeats the current imageUrl', async () => {
        const user = await createUser({ imageUrl: '/images/same-avatar.jpg' });
        const id = user._id.toString();

        await userService.updateById(
            id,
            { imageUrl: '/images/same-avatar.jpg' },
            callerContextAs('admin')
        );

        expect(imageStore.remove).not.toHaveBeenCalled();
    });

    it('actually deactivates the account, not just the USER_DEACTIVATED event', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            { active: false },
            callerContextAs('admin')
        );

        expect(result.success).toBe(true);
        expect((result as { data: UserDocument }).data.active).toBe(false);
        const refreshed = await userRepository.findById(id);
        expect(refreshed!.active).toBe(false);
    });

    it('rejects an escalated role grant and leaves active untouched, rather than committing it first', async () => {
        const user = await createUser({ active: true });
        const id = user._id.toString();

        // A moderator cannot grant `admin` — the escalation must be
        // refused BEFORE the deactivation half of this same request is allowed to land. Rejects
        // rather than resolving to a 409 envelope: `AccessInvariantError` propagates the same way
        // `create()`'s own escalation refusal does, for `@infrastructure/http/errors`'
        // `databaseErrorInterpreter` to map at whichever `.catch()` sits above the caller.
        await expect(
            userService.updateById(
                id,
                { active: false, role: 'admin' },
                callerContextAs('moderator')
            )
        ).rejects.toMatchObject({ name: 'AccessInvariantError' });

        const refreshed = await userRepository.findById(id);
        expect(refreshed!.active).toBe(true);
    });

    /*
     * A PUT carries `role` and `active` on every save. Resending what the user already has must
     * not be a grant (support may edit a customer but could never GRANT `customer`), and must not
     * count a second deactivation.
     */
    it('treats the role already held as no change: no grant check, no role audit', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({}, 'customer');
        const id = user._id.toString();

        const result = await userService.updateById(
            id,
            { role: 'Customer', active: true },
            callerContextAs('support')
        );

        expect(result.success).toBe(true);
        expect(auditSpy).not.toHaveBeenCalledWith(
            // `access`'s own action name — its `audit.ts` is wiring, not published by its barrel.
            expect.objectContaining({ action: 'access.role.assigned' })
        );
    });

    it('counts a deactivation once, not again on every save of an inactive user', async () => {
        const analyticsSpy = observePort(analyticsPort.emitAnalyticsEvent);
        const deactivated = expect.objectContaining({
            event: usersAnalyticsEvents.USER_DEACTIVATED
        });
        const user = await createUser({ active: true });
        const id = user._id.toString();

        await userService.updateById(id, { active: false }, callerContextAs('admin'));
        await userService.updateById(id, { active: false }, callerContextAs('admin'));

        expect(
            analyticsSpy.mock.calls.filter(([event]) => deactivated.asymmetricMatch(event))
        ).toHaveLength(1);
    });

    it('records a ban, not a plain update, when active flips from true to false', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ active: true });
        const id = user._id.toString();

        await userService.updateById(id, { active: false }, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.ADMIN_USER_BANNED,
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('records an unban when active flips from false to true', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ active: false });
        const id = user._id.toString();

        await userService.updateById(id, { active: true }, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.ADMIN_USER_UNBANNED,
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('records a plain update, not a ban, when active is sent unchanged', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ active: true, username: 'stays-active' });
        const id = user._id.toString();

        await userService.updateById(
            id,
            { active: true, username: 'renamed' },
            callerContextAs('admin')
        );

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: usersAuditActions.ADMIN_USER_UPDATED })
        );
    });

    it('records a plain update, not a ban, when active is not mentioned at all', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ active: true });
        const id = user._id.toString();

        await userService.updateById(id, { username: 'renamed-again' }, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({ action: usersAuditActions.ADMIN_USER_UPDATED })
        );
    });

    it('persists a locale change, the same as at creation', async () => {
        const user = await createUser();
        const id = user._id.toString();

        const result = await userService.updateById(id, { locale: 'fr' }, callerContextAs('admin'));

        expect(result.success).toBe(true);
        expect((result as { data: UserDocument }).data.locale).toBe('fr');
    });
});

describe('userService.update', () => {
    it('updates an existing user document directly', async () => {
        const user = await createUser();

        const result = await userService.update(
            user,
            { username: 'direct-update' },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<UserDocument>).data.username).toBe('direct-update');
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

    it('leaves a soft-deleted user deleted when the delete is repeated', async () => {
        // DELETE must be safe to retry: a second one never brings the account back.
        const deletedAt = new Date('2026-01-01T00:00:00Z');
        const user = await createUser({ deletedAt });
        const id = user._id.toString();

        await userService.removeById(id);

        expect((await userRepository.findById(id))!.deletedAt).toEqual(deletedAt);
    });

    it('restores a soft-deleted user through restoreById', async () => {
        const user = await createUser({ deletedAt: new Date() });
        const id = user._id.toString();

        const result = await userService.restoreById(id);

        expect(result.success).toBe(true);
        expect((await userRepository.findById(id))!.deletedAt).toBeUndefined();
    });

    it('answers 409 when restoring a user who is not deleted', async () => {
        const user = await createUser();

        const result = await userService.restoreById(user._id.toString());

        expect((result as ResponseReject).status).toBe(409);
    });

    // The admin-facing audit relocated from `createDeleteController`/
    // `createRestoreController` into this service, matching every other module's write path.
    // These three pin that the same rows still land, from the new layer.
    it('audits ADMIN_USER_SOFT_DELETED for an admin-context soft delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const id = user._id.toString();

        await userService.removeById(id, false, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.ADMIN_USER_SOFT_DELETED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('audits ADMIN_USER_ERASED, not SYSTEM_USER_ERASED, for an admin-context hard delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const id = user._id.toString();

        await userService.removeById(id, true, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.ADMIN_USER_ERASED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('audits ADMIN_USER_RESTORED on a restore', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ deletedAt: new Date() });
        const id = user._id.toString();

        await userService.restoreById(id, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.ADMIN_USER_RESTORED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('hard-deletes a user when hardDelete is true', async () => {
        const user = await createUser();
        const id = user._id.toString();

        await userService.removeById(id, true);

        expect(await userRepository.findById(id)).toBeNull();
    });

    it('erases a platform membership too, not only the tenant one', async () => {
        const user = await createUser();
        const id = user._id.toString();
        // A second platform operator, so the platform row below is not itself the last one
        // administering the installation — this test is about the erasure gap, not that invariant.
        await assignRole('another-operator', null, 'platform', 'operator');
        // A tenant seat AND a platform seat — the erasure gap a single tenant-scoped revoke leaves
        // behind if the platform row is not swept too, surviving the user it points at.
        await assignRole(id, DEPLOYMENT_TENANT_ID, 'tenant', 'customer');
        await assignRole(id, null, 'platform', 'operator');

        await userService.removeById(id, true);

        expect(await membershipsOf(id)).toEqual([]);
    });

    it('returns a 404 rejection when the user does not exist', async () => {
        const result = await userService.removeById('000000000000000000000000');

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(404);
    });

    /* Hard delete is the only path that destroys bytes; the row is gone, so nothing else can. */
    it('removes the avatar from the store on a hard delete', async () => {
        const user = await createUser({ imageUrl: '/images/doomed-avatar.jpg' });
        const id = user._id.toString();

        await userService.removeById(id, true);

        expect(imageStore.remove).toHaveBeenCalledWith('/images/doomed-avatar.jpg');
    });

    /**
     * A soft delete is reversible — `restoreById` brings the account back — so deleting the
     * avatar would restore a user with a broken one.
     */
    it('keeps the avatar on a soft delete', async () => {
        const user = await createUser({ imageUrl: '/images/survives-avatar.jpg' });
        const id = user._id.toString();

        await userService.removeById(id, false);

        expect(imageStore.remove).not.toHaveBeenCalled();
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

    // A hard delete with no audit context (every HTTP-driven caller) must NOT record a
    // system row — `createDeleteController`'s own spec already records one, and a second row
    // here would double the audit trail for the exact same delete.
    it('records no audit row when called with no context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();

        await userService.remove(user, true);

        expect(auditSpy).not.toHaveBeenCalled();
    });

    // The inactivity reaper is the one caller with no request behind it, and passes its own
    // system context — this is the row that closes the "reaper writes no audit row" gap.
    it('records SYSTEM_USER_ERASED when hard-deleted with a system audit context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const id = user._id.toString();

        await userService.remove(user, true, systemCallerContext('User'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.SYSTEM_USER_ERASED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
    });

    it('records SYSTEM_USER_SOFT_DELETED, not an admin action, for a system-context soft delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser();
        const id = user._id.toString();

        await userService.remove(user, false, systemCallerContext('User'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: usersAuditActions.SYSTEM_USER_SOFT_DELETED,
                outcome: 'success',
                target_type: 'user',
                target_id: id
            })
        );
    });

    // The erasure cascade and the document delete run in one transaction — a failure
    // ANYWHERE in it must roll back the whole thing, not leave the user gone with some of the
    // cascade already committed, or the user still there with part of the cascade already run.
    describe('atomicity of the erasure cascade', () => {
        const originalErasers = personalDataErasers();

        afterEach(() => {
            setPersonalDataErasers(originalErasers);
        });

        it('rolls back an already-run eraser when a later one fails', async () => {
            const user = await createUser();
            const id = user._id.toString();
            const firstEraser = jest.fn(
                (userId: string, session: ClientSession) => userRepository.deleteOne(user, session) // stands in for a real eraser's write
            );
            const failingEraser = jest.fn(() => {
                throw new Error('simulated failure partway through the cascade');
            });
            setPersonalDataErasers([firstEraser, failingEraser]);

            await expect(userService.remove(user, true)).rejects.toThrow('simulated failure');

            expect(firstEraser).toHaveBeenCalledTimes(1);
            expect(failingEraser).toHaveBeenCalledTimes(1);
            // The document delete never ran either — it comes after every eraser in the same
            // transaction — and the stand-in "eraser" above got rolled back with it.
            expect(await userRepository.findById(id)).not.toBeNull();
        });

        it('runs an eraser’s deferred step only after the erasure committed', async () => {
            const user = await createUser();
            const id = user._id.toString();
            let stillThereWhenDeferredRan: boolean | undefined;
            const deferring = jest.fn(() =>
                Promise.resolve(() =>
                    userRepository.findById(id).then((found) => {
                        stillThereWhenDeferredRan = found !== null;
                    })
                )
            );
            setPersonalDataErasers([deferring]);

            await userService.remove(user, true);

            expect(stillThereWhenDeferredRan).toBe(false);
        });

        it('never runs a deferred step when a later eraser rolls the erasure back', async () => {
            const user = await createUser();
            const deferred = jest.fn(() => Promise.resolve());
            const deferring = jest.fn(() => Promise.resolve(deferred));
            const failing = jest.fn(() => Promise.reject(new Error('rolled back')));
            setPersonalDataErasers([deferring, failing]);

            await expect(userService.remove(user, true)).rejects.toThrow('rolled back');

            expect(deferred).not.toHaveBeenCalled();
        });

        it('still erases, and still runs the other deferred steps, when one of them fails', async () => {
            const user = await createUser();
            const id = user._id.toString();
            const failingStep = jest.fn(() => Promise.reject(new Error('provider down')));
            const otherStep = jest.fn(() => Promise.resolve());
            setPersonalDataErasers([
                () => Promise.resolve(failingStep),
                () => Promise.resolve(otherStep)
            ]);

            const result = await userService.remove(user, true);

            expect(result.success).toBe(true);
            expect(otherStep).toHaveBeenCalledTimes(1);
            expect(await userRepository.findById(id)).toBeNull();
        });

        it('runs every eraser exactly once, in order, before deleting the document', async () => {
            const user = await createUser();
            const id = user._id.toString();
            const order: string[] = [];
            const first = jest.fn(() => {
                order.push('first');
                return Promise.resolve();
            });
            const second = jest.fn(() => {
                order.push('second');
                return Promise.resolve();
            });
            setPersonalDataErasers([first, second]);

            await userService.remove(user, true);

            expect(order).toEqual(['first', 'second']);
            expect(await userRepository.findById(id)).toBeNull();
        });
    });
});
