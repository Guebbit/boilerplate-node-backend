/**
 * @module
 * Credentials must never reach a response body. A raw Mongoose user document carries the password
 * hash, so two independent guards are asserted here: `select: false` keeps
 * them from loading, and `applyUserTransform`'s allowlist strips them again at serialization —
 * including `.lean()` results, which bypass `toJSON` entirely.
 */
import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { userRepository } from '../../repository';
import * as userService from '@modules/users/services';
import { userService as userServiceObject } from '../../services';

setupTestDb();

/** Every response shape must survive this — it is the assertion that actually matters. */
const expectNoCredentials = (payload: unknown) => {
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('password');
    expect(serialised).not.toContain('$2b$');
};

// A user, as a credential-exposure test seeds one.
const withCredentials = () => createUser();

describe('email is case-insensitive', () => {
    it('stores a mixed-case address lowercased', async () => {
        const user = await createUser({ email: 'Ada@Example.com' });

        expect(user.email).toBe('ada@example.com');
    });

    it('finds an authenticatable account by a differently-cased login attempt', async () => {
        await createUser({ email: 'ada@example.com' });

        const found = await userServiceObject.findForLogin('ADA@example.COM');

        expect(found).not.toBeNull();
        expect(found!.email).toBe('ada@example.com');
    });

    it('the unique index refuses a second account differing only by case', async () => {
        await createUser({ email: 'ada@example.com' });

        await expect(createUser({ email: 'ADA@EXAMPLE.COM' })).rejects.toThrow();
    });
});

describe('user credential exposure', () => {
    describe('select: false (the safety net)', () => {
        it('findById does not load the password', async () => {
            const user = await withCredentials();
            const found = await userRepository.findById(user._id.toString());

            expect(found!.password).toBeUndefined();
        });

        it('findOne does not load the password', async () => {
            await withCredentials();
            const found = await userRepository.findOne({ email: 'user@example.com' });

            expect(found!.password).toBeUndefined();
        });

        it('findAll (lean) does not load the password', async () => {
            await withCredentials();
            const [found] = await userRepository.findAll();

            expect(found.password).toBeUndefined();
            expectNoCredentials(found);
        });

        it('the *WithCredentials finders still return them', async () => {
            const user = await withCredentials();
            const found = await userRepository.findByIdWithCredentials(user._id.toString());

            expect(typeof found!.password).toBe('string');
        });
    });

    describe('applyUserTransform (the contract boundary)', () => {
        it('strips credentials even from a document that carries them', async () => {
            const seeded = await withCredentials();
            const user = await userRepository.findByIdWithCredentials(seeded._id.toString());

            // Precondition: this document really does hold the secrets
            expect(user!.password).toBeTruthy();

            expectNoCredentials(user!.toJSON());
        });

        it('strips _id and __v in favour of the contract id', async () => {
            const user = await withCredentials();
            const json = user.toJSON() as Record<string, unknown>;

            expect(json.id).toBe(user._id.toString());
            expect(JSON.stringify(json)).not.toContain('_id');
            expect(JSON.stringify(json)).not.toContain('__v');
        });

        it('emits only the OpenAPI User properties', async () => {
            const user = await withCredentials();

            // No `role` here: it is a membership fact now, never a column on this document —
            // `@modules/access` is the sole authority, and `presentUser` (`../../presenter`) takes
            // the caller's current role as an explicit parameter instead of reading one off the schema.
            expect(Object.keys(user.toJSON() as object).toSorted()).toEqual([
                'active',
                'createdAt',
                'email',
                'id',
                // The user's preferred language. Public rather than stripped: the client shows
                // it in the profile and writes it back, and it is in the `User` contract.
                'locale',
                'updatedAt',
                'username',
                // WHEN the address was confirmed, or `null` until it is — in the `User` contract,
                // informational only: the membership role is what `cart.self.checkout` actually reads.
                'verifiedAt'
            ]);
        });

        // `active` and `deletedAt` are independent: a deleted-but-active account and a
        // live-but-deactivated one are states a derived `active` cannot express.
        it('keeps active independent of deletedAt', async () => {
            const cases = [
                { email: 'live-active@example.com', active: true, deletedAt: undefined },
                { email: 'live-inactive@example.com', active: false, deletedAt: undefined },
                { email: 'deleted-active@example.com', active: true, deletedAt: new Date() },
                { email: 'deleted-inactive@example.com', active: false, deletedAt: new Date() }
            ];

            return Promise.all(cases.map((fixture) => createUser(fixture))).then((users) => {
                expect(users.map((user) => (user.toJSON() as { active: boolean }).active)).toEqual(
                    cases.map(({ active }) => active)
                );
            });
        });

        it('defaults active to true when the caller omits it', async () => {
            const user = await createUser({ email: 'defaulted@example.com', active: undefined });

            expect((user.toJSON() as { active: boolean }).active).toBe(true);
        });

        // `deletedAt` is exposed, as `Product` exposes it: stripping it would leave deletion with
        // no representation, and a staff list couldn't tell a deleted account from a live one.
        it('exposes deletedAt on a soft-deleted account', async () => {
            const deletedAt = new Date('2026-03-04T05:06:07.000Z');
            const user = await createUser({ email: 'gone@example.com', deletedAt });

            expect((user.toJSON() as { deletedAt: Date }).deletedAt).toEqual(deletedAt);
        });

        it('still never emits credentials alongside it', async () => {
            const user = await createUser({ email: 'gone-too@example.com', deletedAt: new Date() });
            const serialized = user.toJSON() as Record<string, unknown>;

            // Exposing `deletedAt` must not loosen the other: the password is stripped because it
            // must never leave the server, which was never true of `deletedAt`.
            expect(serialized.password).toBeUndefined();
        });

        it('maps a lean list the same way, via userService.search', async () => {
            await withCredentials();
            const { items } = await userService.search({});

            expect(items).toHaveLength(1);
            expect(asStub<{ id: string }>(items[0]).id).toMatch(/^[\da-f]{24}$/);
            expectNoCredentials(items);
        });

        it('normalizes a single lookup via userService.getById (no .toObject() pre-flattening)', async () => {
            const seeded = await createUser({ email: 'lookup@example.com' });
            const found = await userService.getById(seeded._id.toString());

            expect(found!.toJSON()).toMatchObject({ id: seeded.id, email: 'lookup@example.com' });
        });
    });
});
