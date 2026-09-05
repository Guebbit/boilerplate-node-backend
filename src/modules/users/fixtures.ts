/**
 * @module
 * How a user fixture is built, for the demo accounts in `./demo` and for any test needing a
 * person. States no schema default — `imageUrl`, `locale`, `admin`, `active`, `verified` and
 * `tokens` are all filled by `./model` — so `demo-data.json` records what the schema really does.
 * The password stays PLAINTEXT through the builder; `userSchema`'s pre-save hook hashes it on the
 * way into Mongo, and a hash written here would drift from that hook.
 */

import {
    identityOf,
    stripUndefined,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { User } from '@types';
import type { Token, UserDocument } from './model';

/**
 * The password every unpinned fixture gets. Exported so a test that logs in types the same
 * string the builder wrote, rather than a hard-coded copy that drifts. Satisfies the real signup
 * policy (`CreateUserBody.shape.password`) so fixtures can exercise real signup flows.
 */
export const PLAIN_PASSWORD = 'Password1!';

/**
 * What a caller may pin; everything absent is left to the schema. Derived from the generated
 * `User` rather than restated, since the contract already declares `admin`, `active`, `verified`
 * and `locale`. `password` and `tokens` are added because the contract deliberately omits them —
 * they never reach a response, which is why `applyUserTransform` omits them too.
 */
export type UserOverrides = OverridesFor<User> & {
    /** Plaintext. Hashed by the model's pre-save hook, never by a fixture. */
    password?: string;
    tokens?: Token[];
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
    ...fields
}: UserOverrides = {}): UserFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    username: 'testuser',
    email: 'user@example.com',
    password: PLAIN_PASSWORD,
    ...stripUndefined({
        ...fields,
        deletedAt: toDate(deletedAt),
        twoFactorEnabledAt: toDate(twoFactorEnabledAt)
    })
});
