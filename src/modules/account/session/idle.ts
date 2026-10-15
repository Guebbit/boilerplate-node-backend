/**
 * @module
 * The staff idle timeout: a session whose holder has not made a real request for too long ends,
 * for staff and admins only. A shopper's session is never idled out (NIST AAL1 "MAY"; Shopify and
 * Amazon do not either). Enforced here, by the backend, because a client timer is only a courtesy.
 *
 * See: docs/theory/sessions.md#the-staff-idle-timeout
 */

import { levelOfRoles } from '@kernel/permissions';
import type { AuthContext } from '@types';
import { getStaffIdleTimeSeconds } from './config';

/**
 * The idle limit that applies to a caller, in milliseconds.
 *
 * @param roles - the caller's roles, as `AuthContext.roles` carries them
 * @returns the limit, or `0` for a caller it does not apply to (a shopper, or the timeout is off)
 */
export const idleLimitMilliseconds = (roles: AuthContext['roles']): number =>
    levelOfRoles(roles) === 'user' ? 0 : getStaffIdleTimeSeconds() * 1000;

/**
 * Whether a session last active at `lastActive` has idled out for this caller.
 *
 * @param lastActive - when the session last saw a real request
 * @param roles - the caller's roles
 * @param now - the moment to judge at
 */
export const hasIdledOut = (
    lastActive: Date,
    roles: AuthContext['roles'],
    now: Date = new Date()
): boolean => {
    const limit = idleLimitMilliseconds(roles);
    return limit > 0 && now.getTime() - lastActive.getTime() > limit;
};
