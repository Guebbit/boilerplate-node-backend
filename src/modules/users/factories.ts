/**
 * @module
 * How a user row is built, for the seed accounts in `scenarios/users.ts` and for any test needing
 * a person. States no schema default — `imageUrl`, `locale`, `active`, `verifiedAt` and `tokens`
 * are all filled by `./model` — so a seeded row records what the schema really does, not a
 * factory's guess. The password stays PLAINTEXT through the builder; `userSchema`'s pre-save hook
 * hashes it on the way into Mongo, and a hash written here would drift from that hook. No `role`
 * override: the document holds none any more, only a membership does — a fixture needing one
 * calls `assignRole`/`assignDefaultRole` (`@kernel/access/store`) separately, against the id this
 * builder returns.
 */

import {
    identityOf,
    stripUndefined,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/factories';
import type { User } from '@types';
import type { Token, UserDocument } from './model';

/**
 * The password every unpinned fixture gets. Exported so a test that logs in types the same
 * string the builder wrote, rather than a hard-coded copy that drifts. Satisfies the real signup
 * policy (`CreateUserBody.shape.password`) so fixtures can exercise real signup flows — and, since
 * the breached-password check, is deliberately NOT one of the composition-valid strings in
 * `breached-passwords/list.txt` (`Password1!` used to be the fixture and is a listed entry).
 */
export const PLAIN_PASSWORD = 'Fx7$qLwZ9m!';

/**
 * What a caller may pin; everything absent is left to the schema. Derived from the generated
 * `User` rather than restated, since the contract already declares `active`, `verifiedAt` and
 * `locale`. `password` and `tokens` are added because the contract deliberately omits them — they
 * never reach a response, which is why `applyUserTransform` omits them too. `role` is omitted: see
 * the module docblock.
 */
export type UserOverrides = Omit<OverridesFor<User>, 'verifiedAt' | 'role'> & {
    /** Plaintext. Hashed by the model's pre-save hook, never by a fixture. */
    password?: string;
    tokens?: Token[];
    /** Same `Date`-or-string widening `OverridesFor` gives `deletedAt` — commonly pinned inline. */
    verifiedAt?: Date | string;
};

/** A user ready for `userRepository.create`. */
export type UserFixture = Partial<UserDocument> & { _id: UserDocument['_id'] };

/** Builds a user fixture. Anything not passed in `fields` is left for the schema to default. */
export const makeUser = ({
    id,
    createdAt,
    updatedAt,
    deletedAt,
    twoFactorEnabledAt,
    verifiedAt,
    ...fields
}: UserOverrides = {}): UserFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    username: 'testuser',
    email: 'user@example.com',
    password: PLAIN_PASSWORD,
    ...stripUndefined({
        ...fields,
        deletedAt: toDate(deletedAt),
        twoFactorEnabledAt: toDate(twoFactorEnabledAt),
        verifiedAt: toDate(verifiedAt)
    })
});
