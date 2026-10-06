/**
 * @module
 * Field-level encryption for the GDPR-flagged PII this codebase stores outside the account's own
 * secrets — an address-book entry's fullName/street/city/zip/country/phone, a user's own phone.
 * Same AES-256-GCM primitive `account/two-factor/totp.ts`'s TOTP secret uses
 * (`versioned-secret.ts`), under a DIFFERENT key (`NODE_PII_ENCRYPTION_KEY`) so rotating one never
 * touches the other. See `docs/tools/security.md`'s "Database credential and key rotation" for
 * the rotation procedure this ring shares with the TOTP/webhook ones.
 */

import {
    encryptVersionedSecret,
    decryptVersionedSecret,
    type VersionedKey
} from './versioned-secret';
import { piiConfig } from './config';

/** `NODE_PII_ENCRYPTION_KEY`'s ring — see `parseVersionedKeyRing` for the env var's wire format. */
const getPiiEncryptionKeyRing = (): VersionedKey[] => piiConfig().NODE_PII_ENCRYPTION_KEY;

/**
 * Encrypt one PII field for storage. See `encryptVersionedSecret` for the wire format.
 *
 * @param aad - where the value lives, e.g. `users:phone:<user _id>`; decrypting needs the same one
 */
export const encryptPii = (plaintext: string, aad: string): string =>
    encryptVersionedSecret(plaintext, getPiiEncryptionKeyRing(), { purpose: 'pii', aad });

/**
 * Decrypt one stored PII field.
 *
 * @param aad - the one it was encrypted under; a value moved to another row or field fails
 * @param label - what to name the field in a version-mismatch error, e.g. `'address fullName'`
 */
export const decryptPii = (stored: string, aad: string, label: string): string =>
    decryptVersionedSecret(stored, getPiiEncryptionKeyRing(), { purpose: 'pii', aad }, label);
