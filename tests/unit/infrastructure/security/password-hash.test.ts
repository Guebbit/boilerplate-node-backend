/**
 * `password-hash` — argon2id from `node:crypto`, with the PHC string and the constant-time compare
 * that are ours. The properties that matter: a round trip, a wrong password refused, no 72-byte
 * limit (the bcrypt behaviour this replaced), a salt per hash, and a stored value that is not an
 * argon2id string refused rather than thrown on.
 */
import {
    hashPassword,
    hashPasswordSync,
    verifyPassword
} from '@infrastructure/security/password-hash';

describe('hashPassword', () => {
    it('stores a PHC string naming argon2id and its own cost', async () => {
        const stored = await hashPassword('correct horse battery staple');

        expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[\w+/]{22}\$[\w+/]{43}$/);
    });

    it('salts every hash: one password never yields the same string twice', async () => {
        const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);

        expect(first).not.toBe(second);
    });

    it('hashes synchronously to the same shape, for the one import-time decoy', () => {
        expect(hashPasswordSync('decoy')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });
});

describe('verifyPassword', () => {
    it('accepts the right password and refuses a wrong one', async () => {
        const stored = await hashPassword('Tr0ub4dor&3');

        expect(await verifyPassword('Tr0ub4dor&3', stored)).toBe(true);
        expect(await verifyPassword('Tr0ub4dor&4', stored)).toBe(false);
    });

    it('verifies a hash made synchronously, the decoy included', async () => {
        expect(await verifyPassword('decoy', hashPasswordSync('decoy'))).toBe(true);
    });

    it('has no 72-byte limit: two long passwords sharing their first 72 bytes do not match', async () => {
        // bcrypt silently truncated at 72 bytes, so these two verified as the same password.
        const prefix = 'p'.repeat(72);
        const stored = await hashPassword(`${prefix}-one`);

        expect(await verifyPassword(`${prefix}-one`, stored)).toBe(true);
        expect(await verifyPassword(`${prefix}-two`, stored)).toBe(false);
        expect(await verifyPassword(prefix, stored)).toBe(false);
    });

    it('counts a multi-byte password by bytes, not by characters', async () => {
        const stored = await hashPassword('pässwörd-日本語');

        expect(await verifyPassword('pässwörd-日本語', stored)).toBe(true);
        expect(await verifyPassword('passwörd-日本語', stored)).toBe(false);
    });

    it('reads the cost from the stored hash, so a hash made at another cost still verifies', async () => {
        // m=8 KiB, t=1: a cheaper profile than the current constants, built through the primitive
        // by hand to stand in for a hash an older version of this file wrote.
        const { argon2Sync, randomBytes } = await import('node:crypto');
        const salt = randomBytes(16);
        const tag = argon2Sync('argon2id', {
            message: Buffer.from('older cost'),
            nonce: salt,
            parallelism: 1,
            tagLength: 32,
            memory: 8192,
            passes: 1
        });
        const stored = `$argon2id$v=19$m=8192,t=1,p=1$${salt.toString('base64').replaceAll('=', '')}$${tag.toString('base64').replaceAll('=', '')}`;

        expect(await verifyPassword('older cost', stored)).toBe(true);
        expect(await verifyPassword('other', stored)).toBe(false);
    });

    it.each([
        ['a bcrypt hash', '$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz0123456'],
        ['an empty string', ''],
        ['argon2i, not argon2id', '$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E$aGFzaA'],
        ['plaintext', 'hunter2']
    ])('refuses %s without throwing', async (_label, stored) => {
        expect(await verifyPassword('anything', stored)).toBe(false);
    });
});
