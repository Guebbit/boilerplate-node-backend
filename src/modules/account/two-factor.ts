/**
 * @module
 * TOTP secret encryption, code verification, and backup codes — the pure crypto layer this
 * builds on. No database access here; `services/two-factor.ts` is the orchestration that reads
 * and writes the user document. Kept separate so the crypto can be unit-tested against fixed
 * clocks and known secrets without a database in the loop.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { getTotpEncryptionKey } from './session/config';

/**
 * A backup code's stored form — sha256, same shape and reasoning as the refresh-token digests:
 * high-entropy and one-time, so there is no low-entropy secret to stretch and bcrypt would
 * only slow the login path down.
 */
export { hashToken as hashBackupCode } from '@modules/users';

/** RFC 6238 default: a code is valid for this many seconds. */
const TOTP_STEP_SECONDS = 30;

/**
 * Symmetric tolerance around the current step, in seconds — one step either side, to absorb clock
 * drift between the server and the caller's device. Wider is a real weakening of the six-digit
 * code's guesswork cost, not a kindness to slow clocks.
 */
const TOTP_EPOCH_TOLERANCE_SECONDS = TOTP_STEP_SECONDS;

/** How many one-time backup codes `services/two-factor.ts` mints on enrollment. */
export const BACKUP_CODE_COUNT = 10;

/** AES-256-GCM needs a 32-byte key; `NODE_TOTP_ENCRYPTION_KEY` is an operator-chosen string of any length. */
const deriveKey = (secret: string) => createHash('sha256').update(secret).digest();

/**
 * Encrypt a TOTP secret for storage.
 *
 * Format: `<key-version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>` — versioned so a future
 * `NODE_TOTP_ENCRYPTION_KEY` rotation can decrypt old rows against their own key while signing
 * new ones with the new key, rather than a migration that cannot tell which key a row used.
 *
 * @param plaintext - the base32 TOTP secret from `generateTotpSecret`
 * @returns the versioned ciphertext to store in `twoFactorSecret`
 */
export const encryptTotpSecret = (plaintext: string): string => {
    const { version, key } = getTotpEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${version}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
};

/**
 * Decrypt a stored TOTP secret.
 *
 * @param stored - the versioned ciphertext from `twoFactorSecret`
 * @returns the plaintext base32 secret
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or the wrong key version)
 */
export const decryptTotpSecret = (stored: string): string => {
    const [version, ivHex, tagHex, ciphertextHex] = stored.split(':');
    const configured = getTotpEncryptionKey();
    if (version !== configured.version) throw new Error(`Unknown TOTP key version: ${version}`);

    const decipher = createDecipheriv(
        'aes-256-gcm',
        deriveKey(configured.key),
        Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextHex, 'hex')),
        decipher.final()
    ]).toString('utf8');
};

/** A fresh base32 TOTP secret, one per enrollment attempt — see `setupTwoFactor`. */
export const generateTotpSecret = (): string => generateSecret();

/**
 * The issuer name shown in an authenticator app, next to the account label.
 * Reuses `NODE_SMTP_SENDER`'s display name rather than adding a dedicated branding variable —
 * this deployment already named itself there.
 */
const totpIssuer = (): string => process.env.NODE_SMTP_SENDER?.split('<')[0]?.trim() || 'Account';

/**
 * The `otpauth://` URI an authenticator app scans to enroll — the frontend renders it as a QR
 * code; this backend has no business generating an image.
 *
 * @param secret - the base32 secret from `generateTotpSecret`
 * @param label - the account identifier shown under the issuer, normally the user's email
 */
export const buildOtpauthUri = (secret: string, label: string): string =>
    generateURI({ issuer: totpIssuer(), label, secret });

/** What a TOTP verification decided, and the step it matched at — see `verifyTotpCode`. */
export interface TotpVerification {
    valid: boolean;
    /** The RFC 6238 time step the code matched, present only when `valid`. Store as `twoFactorLastUsedStep`. */
    timeStep?: number;
}

/**
 * Verify a 6-digit code against a decrypted secret, ±1 step of skew, constant-time.
 *
 * @param secret - the decrypted base32 secret
 * @param code - the digits the caller typed
 * @param afterTimeStep - reject a code at or before this step — replay protection.
 *   `undefined` on a first-ever verification (enrollment confirm), where there is nothing to replay yet.
 */
export const verifyTotpCode = (
    secret: string,
    code: string,
    afterTimeStep?: number
): Promise<TotpVerification> =>
    verify({
        secret,
        token: code,
        epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
        afterTimeStep
    })
        .then((result): TotpVerification => {
            // `verify`'s return type covers both TOTP and HOTP results, and only TOTP's carries
            // `timeStep` — `strategy` is never passed here (default: 'totp'), so this always holds;
            // `'in'` is what TypeScript can actually narrow the union on.
            if (!result.valid) return { valid: false };
            return { valid: true, timeStep: 'timeStep' in result ? result.timeStep : undefined };
        })
        .catch(
            // `verify` THROWS on a malformed token (wrong length, non-digits) rather than
            // resolving `{ valid: false }` — a shape guardrail, not a rejection this caller
            // should propagate. `verifyCodeOrBackup` tries a backup code on any TOTP failure, and
            // a backup code (ten hex characters) fails this guardrail on every attempt — the bug
            // this catch closes made every backup-code login 500 instead of falling through.
            (): TotpVerification => ({ valid: false })
        );

/**
 * `BACKUP_CODE_COUNT` fresh one-time codes — high-entropy (`randomBytes`), shown to the caller
 * exactly once at confirm time. Never stored in this form; `hashBackupCode` is what persists.
 */
export const generateBackupCodes = (): string[] =>
    Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
