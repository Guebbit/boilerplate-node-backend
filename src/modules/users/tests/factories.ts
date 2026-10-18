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

import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { isAudienceName } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { makeUser } from '../factories';
import type { UserOverrides } from '../factories';
import { seedMembership } from '@modules/access/tests/factories';

export { makeUser, PLAIN_PASSWORD, type UserOverrides } from '../factories';

/**
 * The live repository object, for a sibling's `jest.spyOn` or a raw read/write no named helper
 * below covers — a wrapper function copies the call, not the binding, so it cannot intercept what
 * this module's own code reaches internally. Prefer a named helper when one exists.
 */
export { userRepository } from '../repository';

/**
 * A compliant password DIFFERENT from `PLAIN_PASSWORD`, for a test that changes or resets one.
 * Distinct on purpose: reusing the fixture's own password makes "the password changed" pass on a
 * no-op, since the old credential still works.
 */
export const REPLACEMENT_PASSWORD = 'Replacement1!';

/** The SHORTEST password the policy accepts — exactly the minimum length. */
export const MINIMAL_PASSWORD = 'Aa1!aaaa';

/**
 * A long, all-lowercase passphrase: valid because the policy asks for length alone, with no mix of
 * character classes.
 */
export const PASSPHRASE_PASSWORD = 'correct-horse-battery';

/** Fails the policy outright, for a test asserting the rejection rather than the success. */
export const WEAK_PASSWORD = 'weak';

/**
 * Insert a user into the test database and return the Mongoose document.
 *
 * @param role - a STAFF role grants a TENANT membership through `assignRole` once the document
 *   exists — the document holds no role of its own, only a membership does. `customer` and
 *   `unverified` are audiences, never granted: they write no membership and differ only in
 *   `verifiedAt` (`customer` gets one now unless `overrides` names it). Omit it for an account
 *   with no staff role whose address is left as `overrides` has it.
 */
export const createUser = (overrides: UserOverrides = {}, role?: string): Promise<UserDocument> =>
    userRepository
        .create(
            makeUser(role === 'customer' ? { verifiedAt: new Date(), ...overrides } : overrides)
        )
        .then((user) =>
            role === undefined || isAudienceName(role)
                ? user
                : seedMembership(user.id, DEPLOYMENT_TENANT_ID, 'tenant', role).then(() => user)
        );

/**
 * Insert the demo's `root` — the account every operator test signs in as.
 *
 * TWO ROLES, because that is what the seeded `root` holds and because the two scopes are two
 * jobs: unrestricted inside the shop, and operator over the installation. A fixture carrying only
 * the first would pass every shop test and fail every observability one, which is a fixture that
 * disagrees with the deployment it is standing in for. Both are memberships now — `admin` through
 * {@link createUser}'s own `role` parameter, `operator` the same way `seedAccessModel` writes
 * `root`'s: through `assignRole`, tenant-less (`tenantId: null`, matching `platform`'s own
 * tenant-less-by-definition rule).
 */
export const createAdminUser = (overrides: UserOverrides = {}): Promise<UserDocument> =>
    createUser(
        {
            email: 'owner@example.com',
            username: 'owneruser',
            ...overrides
        },
        'admin'
    ).then((user) => seedMembership(user.id, null, 'platform', 'operator').then(() => user));
