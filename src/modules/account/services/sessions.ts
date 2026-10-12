/**
 * @module
 * The caller's own live sessions, as `GET /account/sessions` publishes them, and the two ways the
 * rest of an account's session data leaves: the data export, and a hard erasure. The credential
 * never leaves here: a live refresh token or session id is as good as a password, so the family
 * id is the handle a client revokes by.
 */

import type { ClientSession } from 'mongoose';
import type { ExportSession, Session } from '@types';
import { sessionRepository, verificationTokenRepository } from '../repository';
import { getSessionMode } from '../session/config';
import { newestPerFamily } from '../session/listing';
import { activeStrategy, type SessionRequest } from '../session/strategy';

/**
 * The authenticated user's live sessions of the active mode.
 *
 * @param userId - the authenticated caller's own id; this endpoint reads no one else's sessions
 * @param request - the caller's own request, naming their session so it can be marked `current`. A
 *   caller authenticating some other way (a bare access token) has no session of their own, so
 *   every row is honestly `current: false`.
 * @returns the sessions, newest sign-in first
 */
export const sessionsList = (userId: string, request: SessionRequest): Promise<Session[]> => {
    const strategy = activeStrategy();
    return strategy.list(userId, strategy.credentialOf(request));
};

/**
 * This caller's own live sessions for the data export: metadata only, never a credential.
 *
 * @param userId - the account being exported
 */
export const exportSessions = (userId: string): Promise<ExportSession[]> =>
    sessionRepository.listLive(userId, getSessionMode(), new Date()).then((rows) =>
        newestPerFamily(rows).map(
            (row): ExportSession => ({
                id: String(row.familyId),
                createdAt: row.startedAt.toISOString(),
                expiration: row.expiresAt.toISOString(),
                ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
                ...(row.device ? { device: row.device } : {})
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
