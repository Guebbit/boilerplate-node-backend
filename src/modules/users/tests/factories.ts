/**
 * @module
 * User factories that touch the test database, built on `../factories`'s plain-payload builder.
 * Kept separate so there is exactly one `makeUser`: this file only persists what that one returns.
 * Passwords are plain text until the model hashes on save — authenticate with `PLAIN_PASSWORD` —
 * and defaulted fields are left unset so `createUser()` exercises the real schema default. The
 * password vocabulary
 * below is the whole set a test may need; `unit/factories.test.ts` is what proves each still plays
 * its part when the policy changes.
 */

import type { UserDocument } from '@modules/users';
import { userRepository } from '@modules/users';
import { assignRole } from '@kernel/access/store';
import { makeUser } from '../factories';
import type { UserOverrides } from '../factories';

export { makeUser, PLAIN_PASSWORD, type UserOverrides } from '../factories';

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

/**
 * Insert the demo's `root` — the account every operator test signs in as.
 *
 * TWO ROLES, because that is what the seeded `root` holds and because the two scopes are two
 * jobs: unrestricted inside the shop, and operator over the installation. A fixture carrying only
 * the first would pass every shop test and fail every observability one, which is a fixture that
 * disagrees with the deployment it is standing in for. The shop role rides the account's own
 * `role` column, same as every other role fixture; the platform one has no column to ride at all
 * — `memberships` is its sole authority — so it is written the same way `seedAccessModel` writes
 * `root`'s: through `assignRole`, tenant-less (`tenantId: null`, matching `platform`'s own
 * tenant-less-by-definition rule).
 */
export const createOwnerUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    createUser({
        role: 'owner',
        email: 'owner@example.com',
        username: 'owneruser',
        ...overrides
    }).then((user) => assignRole(user.id, null, 'platform', 'operator').then(() => user));
