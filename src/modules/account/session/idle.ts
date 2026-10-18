/**
 * @module
 * The staff idle timeout: a session whose holder has not made a real request for too long ends,
 * for staff and admins only. A shopper's session is never idled out (NIST AAL1 "MAY"; Shopify and
 * Amazon do not either). Enforced here, by the backend, because a client timer is only a courtesy.
 *
 * See: docs/theory/sessions.md#the-staff-idle-timeout
 */

import type { AuthContext } from '@types';
import { getStaffIdleTimeSeconds, getStaffLifetimeSeconds } from './config';

/** Whether the caller holds a tenant or platform role, which is what "staff" means here. */
const isStaff = (roles: AuthContext['roles']): boolean =>
    roles.tenant !== null || roles.platform !== null;

/**
 * The idle limit that applies to a caller, in milliseconds.
 *
 * @param roles - the caller's roles, as `AuthContext.roles` carries them
 * @returns the limit, or `0` for a caller it does not apply to (no staff role, or the timeout is off)
 */
export const idleLimitMilliseconds = (roles: AuthContext['roles']): number =>
    isStaff(roles) ? getStaffIdleTimeSeconds() * 1000 : 0;

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

/**
 * The moment a session signed in at `startedAt` must end under the staff lifetime cap. Read on
 * every request, so a customer promoted mid-session is capped from their next request.
 *
 * @param startedAt - when the session family was signed in; a refresh keeps it
 * @param roles - the caller's roles
 * @returns the moment, or `undefined` for a caller the cap does not apply to (or the cap is off)
 */
export const staffCapEndsAt = (startedAt: Date, roles: AuthContext['roles']): Date | undefined => {
    const cap = isStaff(roles) ? getStaffLifetimeSeconds() * 1000 : 0;
    return cap > 0 ? new Date(startedAt.getTime() + cap) : undefined;
};

/**
 * Whether a session signed in at `startedAt` has outlived the staff cap.
 *
 * @param startedAt - when the session family was signed in
 * @param roles - the caller's roles
 * @param now - the moment to judge at
 */
export const hasOutlivedStaffCap = (
    startedAt: Date,
    roles: AuthContext['roles'],
    now: Date = new Date()
): boolean => {
    const endsAt = staffCapEndsAt(startedAt, roles);
    return endsAt !== undefined && now.getTime() > endsAt.getTime();
};
