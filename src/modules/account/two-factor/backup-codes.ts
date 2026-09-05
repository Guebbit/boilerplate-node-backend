/**
 * @module
 * Backup codes — the recovery path shared by every method, since they recover the ACCOUNT rather
 * than any one factor. Minted once, by whichever method an account arms first, and never shown
 * again.
 */

import { randomBytes } from 'node:crypto';

/**
 * A backup code's stored form — sha256, same shape and reasoning as the refresh-token digests:
 * high-entropy and one-time, so there is no low-entropy secret to stretch and bcrypt would
 * only slow the login path down.
 */
export { hashToken as hashBackupCode } from '@modules/users';

/** How many one-time backup codes an account gets. */
export const BACKUP_CODE_COUNT = 10;

/**
 * `BACKUP_CODE_COUNT` fresh one-time codes — high-entropy (`randomBytes`), shown to the caller
 * exactly once. Never stored in this form; `hashBackupCode` is what persists.
 */
export const generateBackupCodes = (): string[] =>
    Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
