/**
 * @module
 * The account's live sessions as the wire's `Session` list — shared by both session modes, which
 * differ only in which rows are theirs and how a request names its own.
 */

import type { AuthContext, Session } from '@types';
import { hashToken } from '@infrastructure/security/hash-token';
import { userService } from '@modules/users';
import { accessService } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { sessionRepository, type SessionRow } from '../repository';
import { predatesSessionEpoch } from './epoch';
import { hasIdledOut, hasOutlivedStaffCap, staffCapEndsAt } from './idle';
import type { SessionMode } from '../session-mode';

/**
 * One row per session. A `jwt` family can hold two live rows at once — two refreshes of one token
 * inside the grace window each mint a successor — and listing both would show one sign-in twice
 * under one id. The newest row speaks for the family.
 *
 * @param rows - live rows, newest sign-in first
 * @returns the rows, one per `familyId`, in the same order
 */
export const newestPerFamily = (rows: readonly SessionRow[]): SessionRow[] => {
    const newest = new Map<string, SessionRow>();
    for (const row of rows) {
        const key = String(row.familyId);
        const kept = newest.get(key);
        // `_id` is time-ordered, so the larger one was written later.
        if (!kept || String(row._id) > String(kept._id)) newest.set(key, row);
    }
    return rows.filter((row) => newest.get(String(row.familyId)) === row);
};

/**
 * Maps one session row to the wire's `Session`.
 *
 * @param row - the family's newest live row
 * @param currentFamilies - the families the caller's own credential belongs to, to mark `current`
 * @param roles - the caller's roles, since the staff lifetime cap can end a session before its row expires
 */
const toSession = (
    row: SessionRow,
    currentFamilies: ReadonlySet<string>,
    roles: AuthContext['roles']
): Session => ({
    id: String(row.familyId),
    createdAt: row.startedAt.toISOString(),
    expiration: new Date(
        Math.min(
            row.expiresAt.getTime(),
            staffCapEndsAt(row.startedAt, roles)?.getTime() ?? Infinity
        )
    ).toISOString(),
    // Absent until this session has been used at least once — an unused session reads as unused
    // rather than as one that happens to share the moment it was issued.
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    ...(row.device ? { device: row.device } : {}),
    current: currentFamilies.has(String(row.familyId))
});

/**
 * The account's live sessions of one mode, newest sign-in first.
 *
 * @param mode - whose rows to list; the other mode's are never shown
 * @param userId - the authenticated caller's own id; this endpoint reads no one else's sessions
 * @param credential - the caller's own credential, when the request carried one, to mark `current`.
 *   A caller with none (a key, a bare access token) has every row honestly `current: false`.
 */
export const listSessions = (
    mode: SessionMode,
    userId: string,
    credential: string | undefined
): Promise<Session[]> =>
    Promise.all([
        sessionRepository.listLive(userId, mode, new Date()),
        userService.findAuthenticatableById(userId),
        accessService.rolesOf(userId, DEPLOYMENT_TENANT_ID)
    ]).then(([allRows, user, roles]) => {
        // A ban moves the account's epoch and deletes no row, and a staff session past its idle
        // limit or lifetime cap is only ended when someone next presents it: neither signs anyone
        // in, so neither is a session. A row stamped before `authTime` existed has no epoch to judge.
        const rows = allRows.filter(
            (row) =>
                (row.authTime === undefined ||
                    !predatesSessionEpoch(row.authTime, user?.tokensValidAfter)) &&
                !hasIdledOut(row.lastUsedAt ?? row.startedAt, roles) &&
                !hasOutlivedStaffCap(row.startedAt, roles)
        );
        const digest = credential === undefined ? undefined : hashToken(credential);
        const current = new Set(
            rows.filter((row) => row.tokenHash === digest).map((row) => String(row.familyId))
        );
        return newestPerFamily(rows).map((row) => toSession(row, current, roles));
    });
