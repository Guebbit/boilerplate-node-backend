/**
 * @module
 * Backup codes — the recovery path shared by every method, since they recover the ACCOUNT rather
 * than any one factor. Minted once, by whichever method an account arms first, and never shown
 * again.
 */

import { randomBytes, scryptSync } from 'node:crypto';

/** How many one-time backup codes an account gets. */
export const BACKUP_CODE_COUNT = 10;

/** Random bytes behind one code before hex-encoding — 40 bits, short enough to type and copy. */
const BACKUP_CODE_BYTES = 5;

/** Bytes of the per-user salt, hex-encoded — 128 bits, the same entropy every one-time secret on this schema uses. */
const BACKUP_CODE_SALT_BYTES = 16;

/** scrypt's output length, in bytes, for a backup-code digest. */
const BACKUP_CODE_KEY_LENGTH = 64;

/**
 * A fresh per-user salt, minted once alongside a set of codes and reused for every one of them —
 * see {@link hashBackupCode} for why not one salt per code.
 */
export const generateBackupCodeSalt = (): string =>
    randomBytes(BACKUP_CODE_SALT_BYTES).toString('hex');

/**
 * A backup code's stored form — scrypt under the account's own salt, not a bare digest.
 *
 * At 40 bits (`generateBackupCodes`), a code is far short of NIST 800-63B's 112-bit line for a
 * "look-up secret" allowed a plain hash: below it, storage has to carry the strength a plain
 * sha256 doesn't, or a database dump turns into working codes in minutes on one GPU. One salt per
 * USER, not per code: a per-code salt would mean up to `BACKUP_CODE_COUNT` scrypt calls on a
 * single login attempt, turning the recovery door into a cheap CPU-burner.
 * https://pages.nist.gov/800-63-3/sp800-63b.html#-5122-look-up-secret-verifiers
 *
 * @param code - the digits, as typed
 * @param salt - the account's `twoFactorBackupCodeSalt`
 * @returns the hex digest to store in `twoFactorBackupCodes`
 */
export const hashBackupCode = (code: string, salt: string): string =>
    scryptSync(code, salt, BACKUP_CODE_KEY_LENGTH).toString('hex');

/**
 * `BACKUP_CODE_COUNT` fresh one-time codes, shown to the caller exactly once. Never stored in this
 * form; `hashBackupCodes` under a fresh {@link generateBackupCodeSalt} is what persists.
 */
export const generateBackupCodes = (): string[] =>
    Array.from({ length: BACKUP_CODE_COUNT }, () =>
        randomBytes(BACKUP_CODE_BYTES).toString('hex')
    );

/** Hashes every code of one freshly minted set under the same salt — see {@link hashBackupCode}. */
export const hashBackupCodes = (codes: readonly string[], salt: string): string[] =>
    codes.map((code) => hashBackupCode(code, salt));
