/**
 * @module
 * The test-side door into `access`'s storage, for a sibling module's own tests.
 * A sibling forces a membership write to fail, or names an audit action, through here instead of
 * reaching `../model` or `../audit`, which its import boundary refuses — see `docs/reference/tests.md`.
 */

import type { AuthorizationScope } from '@types';
import { membershipRepository } from '../repository';
import { ASSIGN_RULE, validateGrant } from '../services/grants';
import type { MembershipDocument } from '../model';

/** The membership rows — a sibling spies on a write here to force a role grant to fail. */
export { membershipModel } from '../model';

/** The audit actions `access` records, so a sibling asserts on the real name. */
export { accessAuditActions } from '../audit';

/**
 * Place a person in a place with a role, without asking who is granting it — for a seeder, a
 * migration or a fixture, which have nobody to escalate from. `assignRole` takes a required
 * granter instead, because an optional one made "no granter" mean "no check". The role is still
 * checked to be one the model declares: a typo in a fixture fails loudly rather than seeding a
 * member who can do nothing.
 *
 * @param userId - the person
 * @param tenantId - the shop, or `null` for a platform role
 * @param scope - which half of the model the role belongs to
 * @param role - the role name
 */
export const seedMembership = (
    userId: string,
    tenantId: string | null,
    scope: AuthorizationScope,
    role: string
): Promise<MembershipDocument> =>
    Promise.resolve()
        .then(() => validateGrant(scope, role, [ASSIGN_RULE]))
        .then((lowered) => membershipRepository.upsertRole(userId, tenantId, scope, lowered));
