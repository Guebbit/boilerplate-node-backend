/**
 * @module
 * TOTP secret encryption and code verification — the crypto a device method is built on, with no
 * database in the loop. Kept pure so it can be unit-tested against fixed clocks and known secrets;
 * `methods/totp.ts` is the adapter that reads and writes the user document.
 */

import { generateURI, verify } from 'otplib';
import {
    encryptVersionedSecret,
    decryptVersionedSecret,
    type SecretBinding
} from '@infrastructure/security/versioned-secret';
import { mailConfig } from '@infrastructure/adapters/config';
import { getTotpEncryptionKeyRing } from '../session/config';

/** RFC 6238 default: a code is valid for this many seconds. */
const TOTP_STEP_SECONDS = 30;

/**
 * Symmetric tolerance around the current step, in seconds — one step either side, to absorb clock
 * drift between the server and the caller's device. Wider is a real weakening of the six-digit
 * code's guesswork cost, not a kindness to slow clocks.
 */
const TOTP_EPOCH_TOLERANCE_SECONDS = TOTP_STEP_SECONDS;

/**
 * The binding of a TOTP secret to its method entry: the `totp` HKDF label and the entry's `_id`
 * as associated data. Also what a re-encryption job rewraps under.
 */
export const totpBinding = (methodId: string): SecretBinding => ({
    purpose: 'totp',
    aad: `users:twoFactorMethods.secret:${methodId}`
});

/**
 * Encrypt a TOTP secret for storage. See `encryptVersionedSecret` for the wire format.
 *
 * @param plaintext - the base32 TOTP secret from otplib's `generateSecret`
 * @param methodId - the method entry's own `_id`; it is the AAD, so the ciphertext only decrypts
 *   on the entry it was written to
 * @returns the versioned ciphertext to store in the method entry's `secret`
 */
export const encryptTotpSecret = (plaintext: string, methodId: string): string =>
    encryptVersionedSecret(plaintext, getTotpEncryptionKeyRing(), totpBinding(methodId));

/**
 * Decrypt a stored TOTP secret.
 *
 * @param stored - the versioned ciphertext from a method entry's `secret`
 * @param methodId - the same entry's `_id`
 * @returns the plaintext base32 secret
 * @throws when the format is malformed, the key is wrong, or the auth tag does not match
 *   (tampering, or the wrong key version)
 */
export const decryptTotpSecret = (stored: string, methodId: string): string =>
    decryptVersionedSecret(stored, getTotpEncryptionKeyRing(), totpBinding(methodId), 'TOTP');

/**
 * The `otpauth://` URI an authenticator app scans to enroll — the frontend renders it as a QR
 * code; this backend has no business generating an image.
 *
 * @param secret - the base32 secret from otplib's `generateSecret`
 * @param label - the account identifier shown under the issuer, normally the user's email
 */
export const buildOtpauthUri = (secret: string, label: string): string =>
    generateURI({
        // The issuer shown in an authenticator app. Reuses `NODE_SMTP_SENDER`'s display name
        // rather than adding a dedicated branding variable — this deployment already named itself.
        issuer: mailConfig().NODE_SMTP_SENDER?.split('<', 1)[0]?.trim() || 'Account',
        label,
        secret
    });

/** What a TOTP verification decided, and the step it matched at — see {@link verifyTotpCode}. */
export interface TotpVerification {
    /** Whether the code verified against the secret. */
    valid: boolean;
    /** The RFC 6238 time step the code matched, present only when `valid`. Store as the entry's `lastUsedStep`. */
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
    // otplib `verify`: checks `token` against `secret`. `epochTolerance` is the clock-skew window in
    // seconds either side; `afterTimeStep` refuses any step at or before it (replay protection).
    // https://otplib.yeojz.dev/
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
            // should propagate. The verification chain tries every other factor after this one,
            // and a ten-character backup code fails that guardrail on every attempt.
            (): TotpVerification => ({ valid: false })
        );
