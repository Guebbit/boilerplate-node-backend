/**
 * @module
 * Password hashing: argon2id from `node:crypto` (Node 24.7+), OWASP's first choice, with no
 * 72-byte input limit and no dependency to keep patched. Node supplies the primitive only, so this
 * file is the small part that is still ours: a salt, the PHC string a hash is stored as, and a
 * constant-time comparison.
 *
 * Cost: m = 19 MiB, t = 2, p = 1 — OWASP Password Storage Cheat Sheet's second argon2id profile,
 * the one that keeps a login under ~50 ms on ordinary hardware. A stored hash carries its own
 * parameters, so verifying never depends on what these constants are now.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
 */

import { argon2, argon2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** Memory cost in KiB: 19 MiB. */
const MEMORY_KIB = 19_456;

/** Passes over that memory. */
const PASSES = 2;

/** Lanes. Parallelism buys a defender nothing on a busy server, so one. */
const PARALLELISM = 1;

/** Bytes of salt: 128 bits, per RFC 9106 §3.1's recommendation. */
const SALT_BYTES = 16;

/** Bytes of output: 256 bits. */
const TAG_BYTES = 32;

/** The PHC string's shape: `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`, base64 without padding. */
const PHC_PATTERN = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([\w+/]+)\$([\w+/]+)$/;

/** The async primitive, promisified once. https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback */
const derive = promisify(argon2);

/** Parameters one derivation runs with. */
interface Derivation {
    memory: number;
    passes: number;
    parallelism: number;
    nonce: Buffer;
}

/** The argon2 call's own parameter object for a password. */
const parametersFor = (password: string, { memory, passes, parallelism, nonce }: Derivation) => ({
    message: Buffer.from(password, 'utf8'),
    nonce,
    parallelism,
    tagLength: TAG_BYTES,
    memory,
    passes
});

/** Serialise parameters and a derived tag as a PHC string. */
const encode = ({ memory, passes, parallelism, nonce }: Derivation, tag: Buffer): string =>
    `$argon2id$v=19$m=${String(memory)},t=${String(passes)},p=${String(parallelism)}` +
    `$${nonce.toString('base64').replaceAll('=', '')}$${tag.toString('base64').replaceAll('=', '')}`;

/**
 * Hash a password for storage.
 *
 * @param password - the plaintext, any length
 * @returns a PHC string carrying its own salt and parameters
 */
export const hashPassword = (password: string): Promise<string> => {
    const parameters = {
        memory: MEMORY_KIB,
        passes: PASSES,
        parallelism: PARALLELISM,
        nonce: randomBytes(SALT_BYTES)
    };
    // Node: argon2id with the options above; the callback form runs on the threadpool, off the event loop.
    return derive('argon2id', parametersFor(password, parameters)).then((tag) =>
        encode(parameters, tag)
    );
};

/**
 * Hash synchronously — only for the one value computed at import time (the unknown-email decoy),
 * where a promise would just move the wait.
 *
 * @param password - the plaintext
 */
export const hashPasswordSync = (password: string): string => {
    const parameters = {
        memory: MEMORY_KIB,
        passes: PASSES,
        parallelism: PARALLELISM,
        nonce: randomBytes(SALT_BYTES)
    };
    return encode(parameters, argon2Sync('argon2id', parametersFor(password, parameters)));
};

/**
 * Check a password against a stored hash, in constant time.
 *
 * @param password - the plaintext being tried
 * @param stored - a PHC string from {@link hashPassword}
 * @returns whether they match; a stored value that is not an argon2id PHC string never matches
 */
export const verifyPassword = (password: string, stored: string): Promise<boolean> => {
    const match = PHC_PATTERN.exec(stored);
    if (!match) return Promise.resolve(false);

    const [, memory, passes, parallelism, salt, hash] = match;
    const expected = Buffer.from(hash, 'base64');
    return derive(
        'argon2id',
        parametersFor(password, {
            memory: Number(memory),
            passes: Number(passes),
            parallelism: Number(parallelism),
            nonce: Buffer.from(salt, 'base64')
        })
    ).then((tag) => tag.length === expected.length && timingSafeEqual(tag, expected));
};
