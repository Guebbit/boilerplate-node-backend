/**
 * @module
 * User fixtures that touch the test database, built on `../fixtures`'s plain-payload builder and
 * kept separate after two divergent `makeUser` copies once caused confusion. Passwords are plain
 * text until the model hashes on save — authenticate with `PLAIN_PASSWORD` — and defaulted fields
 * are left unset so `createUser()` exercises the real schema default. The password vocabulary
 * below is the whole set a test may need; `unit/fixtures.test.ts` is what proves each still plays
 * its part when the policy changes.
 */

import type { UserDocument } from '@modules/users';
import { userRepository } from '@modules/users';
import { makeUser } from '../fixtures';
import type { UserOverrides } from '../fixtures';

export { makeUser, PLAIN_PASSWORD, type UserOverrides } from '../fixtures';

/**
 * A compliant password DIFFERENT from `PLAIN_PASSWORD`, for a test that changes or resets one.
 * Distinct on purpose: reusing the fixture's own password makes "the password changed" pass on a
 * no-op, since the old credential still works.
 */
export const REPLACEMENT_PASSWORD = 'Replacement1!';

/** The SHORTEST password the policy accepts — exactly the minimum length, one of each class. */
export const MINIMAL_PASSWORD = 'Aa1!aaaa';

/**
 * Long enough, but missing character classes: what an account created before the complexity rule
 * still holds. Only ever an EXISTING password — provable at login and as `currentPassword`, never
 * settable — which is the distinction `Password` and `PasswordNew` draw in `openapi.yaml`.
 */
export const LEGACY_PASSWORD = 'correct-horse-battery';

/** Fails the policy outright, for a test asserting the rejection rather than the success. */
export const WEAK_PASSWORD = 'weak';

/** Insert a user into the test database and return the Mongoose document. */
export const createUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    userRepository.create(makeUser(overrides));

/** Insert an admin user into the test database. */
export const createAdminUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    createUser({
        admin: true,
        email: 'admin@example.com',
        username: 'adminuser',
        ...overrides
    });
