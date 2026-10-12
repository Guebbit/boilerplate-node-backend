/**
 * @module
 * The caller's own live sessions, as `GET /account/sessions` publishes them. The credential never
 * leaves here: a live refresh token or session id is as good as a password, so the family id is
 * the handle a client revokes by.
 */

import type { ClientSession } from 'mongoose';
import type { ExportSession, Session } from '@types';
import { hashToken } from '@infrastructure/security/hash-token';
import { sessionRepository, verificationTokenRepository, type SessionRow } from '../repository';

/**
 * One row per session. A `jwt` family can hold two live rows at once — two refreshes of one token
 * inside the grace window each mint a successor — and listing both would show one sign-in twice
 * under one id. The newest row speaks for the family.
 *
 * @param rows - live rows, newest sign-in first
 * @returns the rows, one per `familyId`, in the same order
 */
const newestPerFamily = (rows: readonly SessionRow[]): SessionRow[] => {
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
 */
const toSession = (row: SessionRow, currentFamilies: ReadonlySet<string>): Session => ({
    id: String(row.familyId),
    expiration: row.expiresAt.toISOString(),
    // Absent until this session has been used at least once — an unused session reads as unused
    // rather than as one that happens to share the moment it was issued.
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    current: currentFamilies.has(String(row.familyId))
});

/**
 * The authenticated user's live sessions of the active mode.
 *
 * @param userId - the authenticated caller's own id; this endpoint reads no one else's sessions
 * @param credential - the caller's own credential (refresh cookie), when they sent one, to mark
 *   the current row. A bearer-only caller has none, so every row is honestly `current: false`.
 * @returns the sessions, newest sign-in first
 */
export const sessionsList = (userId: string, credential?: string): Promise<Session[]> =>
    sessionRepository.listLive(userId, 'jwt', new Date()).then((rows) => {
        const digest = credential === undefined ? undefined : hashToken(credential);
        const current = new Set(
            rows.filter((row) => row.tokenHash === digest).map((row) => String(row.familyId))
        );
        return newestPerFamily(rows).map((row) => toSession(row, current));
    });

/**
 * This caller's own live sessions for the data export: metadata only, never a credential.
 *
 * @param userId - the account being exported
 */
export const exportSessions = (userId: string): Promise<ExportSession[]> =>
    sessionRepository.listLive(userId, 'jwt', new Date()).then((rows) =>
        newestPerFamily(rows).map(
            (row): ExportSession => ({
                id: String(row.familyId),
                expiration: row.expiresAt.toISOString(),
                ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {})
            })
        )
    );

/**
 * Erase everything this module keeps to sign an account in or prove a link: its sessions and its
 * one-time tokens. Part of a hard account deletion, so both deletes join the erasure's transaction.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 */
export const eraseSessionsAndTokens = (userId: string, session: ClientSession): Promise<void> =>
    sessionRepository
        .removeAll(userId, session)
        .then(() => verificationTokenRepository.removeAll(userId, session));
