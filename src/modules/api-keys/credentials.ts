/**
 * @module
 * Mint and verify — the one-way hashing half of a credential's lifecycle. Storage is sha256, not
 * encryption: a credential is verified, never re-signed with, so the right precedent is
 * `hashToken` (`@modules/users`), already reused by `account/two-factor/backup-codes.ts` for the
 * same "high-entropy, one-time, no stretching needed" reasoning — `randomBytes(32)` has no search
 * space for bcrypt/argon2 to make expensive, so the ~100ms they would cost on every authenticated
 * request buys nothing.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 */

import { randomBytes } from 'node:crypto';
import { hashToken } from '@modules/users';
import { API_KEY_TOKEN_PREFIX } from '@kernel/authentication';
import { constantTimeEqual } from '@infrastructure/security/constant-time';

/**
 * Bytes of randomness in the public prefix — enough to make collision practically impossible,
 * small enough to stay a readable identifier. `base64url` of 6 bytes is ALWAYS exactly 8
 * characters (48 bits ÷ 6 bits/char, no padding) — a fixed length is what lets
 * {@link parseApiKeyToken} slice the prefix out by position instead of splitting on `_`, which
 * base64url's own alphabet can legally contain.
 */
const PREFIX_BYTES = 6;

/** The public prefix's fixed character length — see {@link PREFIX_BYTES}. */
const PUBLIC_PREFIX_LENGTH = 8;

/** Bytes of randomness in the secret half — 256 bits, the same budget every other high-entropy token in this repo mints at. */
const SECRET_BYTES = 32;

/** A freshly minted credential: the plaintext (shown to the caller exactly once), and what gets stored. */
export interface MintedApiKey {
    plaintext: string;
    publicPrefix: string;
    hash: string;
}

/**
 * Mint a new credential: `sk_<prefix>_<secret>`, both halves `base64url` so the whole token is
 * URL- and header-safe with no further encoding. The prefix is stored and indexed — it is what
 * turns verification into one indexed lookup instead of a collection scan, and it is NOT secret,
 * so a display column showing it (`sk_a1b2c3d4…`) leaks nothing.
 */
export const mintApiKey = (): MintedApiKey => {
    const publicPrefix = randomBytes(PREFIX_BYTES).toString('base64url');
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const plaintext = `${API_KEY_TOKEN_PREFIX}${publicPrefix}_${secret}`;

    return { plaintext, publicPrefix, hash: hashToken(plaintext) };
};

/**
 * Split a presented `Authorization` value into its public prefix, or `undefined` when it is too
 * short to be one of ours — the credential-resolve path's first, cheap rejection, before any
 * database lookup or hashing.
 *
 * Position-based, NOT `token.split('_')`: base64url's alphabet includes `_`, so either half of a
 * real token can legally contain one, and splitting on it would misalign the prefix as often as
 * it worked. {@link PUBLIC_PREFIX_LENGTH} is fixed by construction (see its own doc comment),
 * which is what makes slicing by position exact instead of a guess.
 */
export const parseApiKeyToken = (token: string): { publicPrefix: string } | undefined => {
    if (!token.startsWith(API_KEY_TOKEN_PREFIX)) return undefined;

    const prefixStart = API_KEY_TOKEN_PREFIX.length;
    const prefixEnd = prefixStart + PUBLIC_PREFIX_LENGTH;

    if (token.length <= prefixEnd || token[prefixEnd] !== '_') return undefined;

    return { publicPrefix: token.slice(prefixStart, prefixEnd) };
};

/**
 * Does `plaintext` hash to `storedHash`? Compares the DIGESTS in constant time, not the plaintext
 * itself — hashing first means every comparison is the same fixed length regardless of the
 * presented token's own length, so a mismatched length can never itself be observed.
 */
export const verifyApiKey = (plaintext: string, storedHash: string): boolean =>
    constantTimeEqual(hashToken(plaintext), storedHash);

/**
 * The display-safe identifier for a credential — the audit trail's `actor_credential_id` and
 * anywhere else a key needs naming without risking the secret. Never the database `_id`: an
 * operator recognises a key by its prefix, the same string a request presents and a list shows.
 */
export const displayIdOf = (publicPrefix: string): string =>
    `${API_KEY_TOKEN_PREFIX}${publicPrefix}`;
