/**
 * Regression guard for the credential leak fixed in PROPOSAL §2 (option C).
 *
 * `GET /users` and `GET /users/:id` used to serialise the raw Mongoose document, which carried
 * the bcrypt hash and every live refresh token. Two independent mechanisms now prevent it:
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
import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser } from '../../helpers/factories/users';
import * as userRepository from '@repositories/users';
import * as userService from '@services/users';
import { ETokenType } from '@models/users';

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

        it('strips _id, __v and cart in favour of the contract id', async () => {
            const user = await withTokens();
            const json = user.toJSON() as Record<string, unknown>;

            expect(json.id).toBe((user._id as Types.ObjectId).toString());
            expect(JSON.stringify(json)).not.toContain('_id');
            expect(JSON.stringify(json)).not.toContain('__v');
            expect(json.cart).toBeUndefined();
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
                'username'
            ]);
        });

        it('derives active from deletedAt', async () => {
            const active = await createUser({ email: 'active@example.com' });
            const deleted = await createUser({
                email: 'deleted@example.com',
                deletedAt: new Date()
            });

            expect((active.toJSON() as { active: boolean }).active).toBe(true);
            expect((deleted.toJSON() as { active: boolean }).active).toBe(false);
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
