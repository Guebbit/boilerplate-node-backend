/**
 * How a user fixture is built — for the demo accounts in `./demo` and for any test needing a
 * person.
 *
 * Like every fixture builder here it states no schema default: `imageUrl`, `locale`, `admin`, `active`,
 * `verified` and `tokens` are all filled by `./model`, so `demo-data.json` ends up recording what the
 * schema really does. `locale` is the case that proves the point — the paired frontend's mock never
 * carried it at all, because nobody hand-restating a User remembered it existed.
 *
 * The password is PLAINTEXT and stays that way through the builder. `userSchema`'s pre-save hook
 * hashes it on the way into Mongo; a hash written here would drift from that hook and lose its
 * plaintext, which is what once happened to the `gino@pino.it` fixture.
 */

import {
    identityOf,
    compact,
    toDate,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { User } from '@types';
import type { Token, UserDocument } from './model';

/**
 * The password every unpinned fixture gets.
 *
 * Exported because a test that logs in has to type the same string the builder wrote, and a
 * hard-coded copy at the login call site is a copy that drifts. It satisfies the real signup
 * policy (`CreateUserBody.shape.password`) on purpose: a fixture the API would refuse to register
 * is a fixture that cannot exercise the flows it exists for.
 */
export const PLAIN_PASSWORD = 'Password1!';

/**
 * What a caller may pin. Everything absent is left to the schema.
 *
 * Derived from the generated `User` — `openapi.yaml` already says an account has an `admin`, an
 * `active`, a `verified` and a `locale`, and restating that list here is how a mock ends up
 * carrying five of the six fields a contract declares.
 *
 * Two fields are ADDED rather than derived, and both because the contract deliberately does not
 * have them: a password and a token never reach a response, which is exactly why
 * `applyUserTransform` omits them.
 */
export type UserOverrides = OverridesFor<User> & {
    /** Plaintext. Hashed by the model's pre-save hook, never by a fixture. */
    password?: string;
    tokens?: Token[];
};

/** A user ready for `userRepository.create`. */
export type UserFixture = Partial<UserDocument> & { _id: UserDocument['_id'] };

export const makeUser = ({
    id,
    createdAt,
    updatedAt,
    deletedAt,
    ...fields
}: UserOverrides = {}): UserFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    username: 'testuser',
    email: 'user@example.com',
    password: PLAIN_PASSWORD,
    ...compact({ ...fields, deletedAt: toDate(deletedAt) })
});
