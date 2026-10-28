/**
 * @module
 * The one place a stored session row, or an export, becomes the wire shape. Pure: it
 * takes already-decided values (which sessions are the caller's own, when the staff cap ends one)
 * and only maps, so the rules stay in `session/` and `services/`.
 *
 * A session's credential never reaches the wire: the family id is the handle a client revokes by.
 */

import type {
    AccountExport,
    AccountExportStatus,
    ExportSession,
    OAuthLinks,
    Session
} from '@types';
import type { AccountExportRow, SessionRow } from './repository';

/**
 * The fields a session shows wherever it is shown.
 *
 * @param row - the family's newest live row
 * @param expiresAt - when the session ends: the row's own expiry, or the staff lifetime cap if sooner
 */
const sessionFields = (row: SessionRow, expiresAt: Date): ExportSession => ({
    id: String(row.familyId),
    createdAt: row.startedAt.toISOString(),
    expiration: expiresAt.toISOString(),
    // Absent until this session has been used at least once — an unused session reads as unused
    // rather than as one that happens to share the moment it was issued.
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    ...(row.device ? { device: row.device } : {})
});

/**
 * A session as `GET /account/sessions` lists it.
 *
 * @param row - the family's newest live row
 * @param expiresAt - when the session ends, the staff lifetime cap applied
 * @param current - whether the caller's own credential belongs to this session
 */
export const presentSession = (row: SessionRow, expiresAt: Date, current: boolean): Session => ({
    ...sessionFields(row, expiresAt),
    current
});

/**
 * A session as the data export carries it: metadata only, no `current` (there is no request).
 *
 * @param row - the family's newest live row
 */
export const presentExportSession = (row: SessionRow): ExportSession =>
    sessionFields(row, row.expiresAt);

/**
 * The caller's export as `POST` and `GET /account/export` answer it. `expiresAt` rides only a
 * `ready` export: on any other status it is a bookkeeping date, not a promise about a file.
 *
 * @param row - the account's export row
 * @param status - the status to show, which is not always the stored one (see `readOwnExport`)
 */
export const presentExport = (
    row: Pick<AccountExportRow, '_id' | 'createdAt' | 'expiresAt'>,
    status: AccountExportStatus
): AccountExport => ({
    id: String(row._id),
    status,
    createdAt: row.createdAt.toISOString(),
    actions: { download: status === 'ready', request: status !== 'building' },
    ...(status === 'ready' ? { expiresAt: row.expiresAt.toISOString() } : {})
});

/**
 * The caller's connected sign-in providers as `GET /account/oauth/links` and
 * `DELETE /account/oauth/links/{provider}` answer them.
 *
 * @param links - one entry per linked provider, as `listOAuthLinks` returns them
 */
export const presentOAuthLinks = (
    links: { provider: string; connectedAt: Date }[]
): OAuthLinks => ({
    links: links.map(({ provider, connectedAt }) => ({
        provider,
        connectedAt: connectedAt.toISOString()
    }))
});
