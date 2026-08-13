/**
 * Credentials must never reach a response body.
 *
 * Serialising a raw Mongoose user document would carry the bcrypt hash and every live refresh
 * token, so two independent mechanisms stand between it and `GET /users` / `GET /users/:id`:
 *
 *   1. `select: false` on the schema — the fields are not even loaded by the normal finders
 *   2. `applyUserTransform` (the schema's `toJSON` transform) — an allowlist of the OpenAPI
 *      `User` properties, applied both to real documents (via `.toJSON()`/`res.json`) and to
 *      `.lean()` list results (mapped manually in `userService.search`, since `.lean()` bypasses
 *      `toJSON` entirely).
 *
 * Both are asserted here, because either one alone would let the leak back in through a path
 * the other does not cover.
 */
import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { userRepository } from '@modules/users';
import * as userService from '@modules/users/service';
import { ETokenType } from '@modules/users';

setupTestDb();

/** Every response shape must survive this — it is the assertion that actually matters. */
const expectNoCredentials = (payload: unknown) => {
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('password');
    expect(serialised).not.toContain('tokens');
    expect(serialised).not.toContain('$2b$');
};

const withTokens = () =>
    createUser({
        tokens: [
            {
                type: ETokenType.REFRESH,
                token: 'refresh-token-value',
                expiration: new Date(Date.now() + 60_000)
            }
        ]
    });

describe('user credential exposure', () => {
    describe('select: false (the safety net)', () => {
        it('findById does not load password or tokens', async () => {
            const user = await withTokens();
            const found = await userRepository.findById((user._id as Types.ObjectId).toString());

            expect(found!.password).toBeUndefined();
            expect(found!.tokens).toBeUndefined();
        });

        it('findOne does not load password or tokens', async () => {
            await withTokens();
            const found = await userRepository.findOne({ email: 'user@example.com' });

            expect(found!.password).toBeUndefined();
            expect(found!.tokens).toBeUndefined();
        });

        it('findAll (lean) does not load password or tokens', async () => {
            await withTokens();
            const [found] = await userRepository.findAll();

            expect(found.password).toBeUndefined();
            expect(found.tokens).toBeUndefined();
            expectNoCredentials(found);
        });

        it('the *WithCredentials finders still return them', async () => {
            const user = await withTokens();
            const found = await userRepository.findByIdWithCredentials(
                (user._id as Types.ObjectId).toString()
            );

            expect(typeof found!.password).toBe('string');
            expect(found!.tokens).toHaveLength(1);
        });
    });

    describe('applyUserTransform (the contract boundary)', () => {
        it('strips credentials even from a document that carries them', async () => {
            const seeded = await withTokens();
            const user = await userRepository.findByIdWithCredentials(
                (seeded._id as Types.ObjectId).toString()
            );

            // Precondition: this document really does hold the secrets
            expect(user!.password).toBeTruthy();
            expect(user!.tokens).toHaveLength(1);

            expectNoCredentials(user!.toJSON());
        });

        it('strips _id and __v in favour of the contract id', async () => {
            const user = await withTokens();
            const json = user.toJSON() as Record<string, unknown>;

            expect(json.id).toBe((user._id as Types.ObjectId).toString());
            expect(JSON.stringify(json)).not.toContain('_id');
            expect(JSON.stringify(json)).not.toContain('__v');
        });

        it('emits only the OpenAPI User properties', async () => {
            const user = await withTokens();

            expect(Object.keys(user.toJSON() as object).toSorted()).toEqual([
                'active',
                'admin',
                'createdAt',
                'email',
                'id',
                'imageUrl',
                // The user's preferred language. Public rather than stripped: the client shows
                // it in the profile and writes it back, and it is in the `User` contract.
                'locale',
                'updatedAt',
                'username',
                // Whether the address is confirmed — in the `User` contract, and the client's
                // cue for the "verify your email" banner.
                'verified'
            ]);
        });

        /*
         * `active` and `deletedAt` are independent, and this is the test that says so. All four
         * combinations are exercised deliberately: a deleted-but-active account and a
         * live-but-deactivated one are exactly the states a derived `active` cannot express.
         */
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

        /*
         * `deletedAt` is exposed, as `Product` exposes it: with `active` an independent fact,
         * stripping it would leave deletion with no representation at all and an admin list could
         * not tell a deleted account from a live one.
         *
         * The key-list test above is the other half of this: an account that was never deleted has
         * no `deletedAt` key to emit, so the field appears only where it means something.
         */
        it('exposes deletedAt on a soft-deleted account', async () => {
            const deletedAt = new Date('2026-03-04T05:06:07.000Z');
            const user = await createUser({ email: 'gone@example.com', deletedAt });

            expect((user.toJSON() as { deletedAt: Date }).deletedAt).toEqual(deletedAt);
        });

        it('still never emits credentials alongside it', async () => {
            const user = await createUser({ email: 'gone-too@example.com', deletedAt: new Date() });
            const serialized = user.toJSON() as Record<string, unknown>;

            // Exposing `deletedAt` must not loosen the others: these two are stripped because
            // they must never leave the server, which was never true of `deletedAt`.
            expect(serialized.password).toBeUndefined();
            expect(serialized.tokens).toBeUndefined();
        });

        it('maps a lean list the same way, via userService.search', async () => {
            await withTokens();
            const { items } = await userService.search({});

            expect(items).toHaveLength(1);
            expect((items[0] as unknown as { id: string }).id).toMatch(/^[\da-f]{24}$/);
            expectNoCredentials(items);
        });

        it('normalizes a single lookup via userService.getById (no .toObject() pre-flattening)', async () => {
            const seeded = await createUser({ email: 'lookup@example.com' });
            const found = await userService.getById((seeded._id as Types.ObjectId).toString());

            expect(found!.toJSON()).toMatchObject({ id: seeded.id, email: 'lookup@example.com' });
        });
    });
});
