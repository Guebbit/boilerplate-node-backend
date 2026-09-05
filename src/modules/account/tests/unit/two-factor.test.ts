/**
 * @module
 * `account/two-factor/` — the pure layers, no database in the loop. Encryption round-trips against
 * a real key, TOTP codes are generated and verified against fixed clocks (never wall time), backup
 * codes hash the same way `hashToken` always has, and a delivered code's TTL, cooldown and attempt
 * ceiling are driven against an injected clock rather than a timer.
 */

import { createHash } from 'node:crypto';
import { generate } from 'otplib';
import type { TwoFactorMethodRecord } from '@modules/users';
import {
    armDeliveredCode,
    consumeDeliveredCode,
    deliveryCooldownRemaining,
    generateDeliveredCode,
    hashDeliveredCode,
    DELIVERED_CODE_MAX_ATTEMPTS,
    DELIVERED_CODE_RESEND_SECONDS,
    DELIVERED_CODE_TTL_MS,
    encryptTotpSecret,
    decryptTotpSecret,
    generateTotpSecret,
    buildOtpauthUri,
    verifyTotpCode,
    generateBackupCodes,
    hashBackupCode,
    BACKUP_CODE_COUNT
} from '../../two-factor';

describe('TOTP secret encryption', () => {
    it('round-trips a secret through encrypt then decrypt', () => {
        const secret = generateTotpSecret();

        expect(decryptTotpSecret(encryptTotpSecret(secret))).toBe(secret);
    });

    it('produces a different ciphertext each time, even for the same secret', () => {
        // A fresh random IV per call — two enrollments minting the identical secret (unlikely,
        // but not impossible) must not be distinguishable from their stored ciphertext alone.
        const secret = generateTotpSecret();

        expect(encryptTotpSecret(secret)).not.toBe(encryptTotpSecret(secret));
    });

    it('carries the key version as a prefix', () => {
        expect(encryptTotpSecret(generateTotpSecret())).toMatch(/^v1:/);
    });

    it('rejects a tampered ciphertext', () => {
        const tampered = encryptTotpSecret(generateTotpSecret()).replace(/.$/, (c) =>
            c === '0' ? '1' : '0'
        );

        expect(() => decryptTotpSecret(tampered)).toThrow();
    });
});

describe('buildOtpauthUri', () => {
    it('names the account and carries the secret', () => {
        const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'person@example.com');

        expect(uri).toMatch(/^otpauth:\/\/totp\//);
        expect(uri).toContain('person%40example.com');
        expect(uri).toContain('JBSWY3DPEHPK3PXP');
    });
});

describe('verifyTotpCode — fixed-clock vectors, never wall time', () => {
    const FIXED_EPOCH_SECONDS = 1_893_456_000; // 2030-01-01T00:00:00Z, arbitrary and stable

    it('accepts a code generated for the current step', async () => {
        const secret = generateTotpSecret();
        // The code an authenticator app would show at this exact instant — generated
        // independently of `verifyTotpCode`, the same way a real device would.
        const code = await generate({ secret, epoch: FIXED_EPOCH_SECONDS });

        jest.useFakeTimers().setSystemTime(FIXED_EPOCH_SECONDS * 1000);
        try {
            await expect(verifyTotpCode(secret, code)).resolves.toMatchObject({ valid: true });
        } finally {
            jest.useRealTimers();
        }
    });

    it('rejects a wrong code', async () => {
        const secret = generateTotpSecret();
        const wrong = await generate({ secret, epoch: FIXED_EPOCH_SECONDS + 3600 }); // an hour away

        jest.useFakeTimers().setSystemTime(FIXED_EPOCH_SECONDS * 1000);
        try {
            await expect(verifyTotpCode(secret, wrong)).resolves.toEqual({ valid: false });
        } finally {
            jest.useRealTimers();
        }
    });

    it('rejects a code at or before the given time step — replay protection', async () => {
        const secret = generateTotpSecret();
        const code = await generate({ secret, epoch: FIXED_EPOCH_SECONDS });

        jest.useFakeTimers().setSystemTime(FIXED_EPOCH_SECONDS * 1000);
        try {
            const first = await verifyTotpCode(secret, code);
            expect(first.valid).toBe(true);

            // The identical code, presented again inside the same window: rejected once
            // `afterTimeStep` names the step it already matched.
            const replay = await verifyTotpCode(secret, code, first.timeStep);
            expect(replay).toEqual({ valid: false });
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('backup codes', () => {
    it('mints BACKUP_CODE_COUNT codes, all distinct', () => {
        const codes = generateBackupCodes();

        expect(codes).toHaveLength(BACKUP_CODE_COUNT);
        expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    });

    it('hashes deterministically, so a stored digest can be matched against a re-hash', () => {
        const [code] = generateBackupCodes();

        expect(hashBackupCode(code)).toBe(hashBackupCode(code));
    });

    it('hashes two different codes to two different digests', () => {
        const [first, second] = generateBackupCodes();

        expect(hashBackupCode(first)).not.toBe(hashBackupCode(second));
    });
});

/** A bare method entry, the shape `services/two-factor.ts` hands a handler. */
const entry = (): TwoFactorMethodRecord => ({ method: 'email' });

/** A fixed instant, so nothing here depends on how long the suite took to get here. */
const now = new Date('2026-09-04T12:00:00.000Z');

describe('delivered codes — the shared machinery behind email, and every channel after it', () => {
    it('mints six digits, zero-padded', () => {
        // 200 draws rather than one: a `randomInt` low enough to need padding is roughly a
        // one-in-ten draw, so a single sample would pass on a broken implementation nine times out
        // of ten.
        const codes = Array.from({ length: 200 }, () => generateDeliveredCode());

        expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    });

    it('accepts the code it armed, and only once', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);

        expect(consumeDeliveredCode(record, '123456', now)).toBe(true);
        // Spent: the second presentation of a correct code has nothing left to match against.
        expect(consumeDeliveredCode(record, '123456', now)).toBe(false);
    });

    it('rejects a code past its expiry, and forgets it', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);
        const late = new Date(now.getTime() + DELIVERED_CODE_TTL_MS + 1);

        expect(consumeDeliveredCode(record, '123456', late)).toBe(false);
        expect(record.codeHash).toBeUndefined();
    });

    it('burns the code after DELIVERED_CODE_MAX_ATTEMPTS wrong guesses', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);

        for (let attempt = 0; attempt < DELIVERED_CODE_MAX_ATTEMPTS; attempt++)
            expect(consumeDeliveredCode(record, '000000', now)).toBe(false);

        // The RIGHT code, presented after the ceiling: the budget is what protects six digits, so
        // exhausting it has to cost the code itself rather than just the last guess.
        expect(consumeDeliveredCode(record, '123456', now)).toBe(false);
    });

    it('reports the cooldown remaining, and clears it once it elapses', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);

        expect(deliveryCooldownRemaining(record, now)).toBe(DELIVERED_CODE_RESEND_SECONDS);
        expect(
            deliveryCooldownRemaining(
                record,
                new Date(now.getTime() + DELIVERED_CODE_RESEND_SECONDS * 1000)
            )
        ).toBe(0);
    });

    it('has no cooldown before anything was ever sent', () => {
        expect(deliveryCooldownRemaining(entry(), now)).toBe(0);
    });

    it('stores a keyed digest, not the digits and not a bare hash', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);

        expect(record.codeHash).not.toContain('123456');
        // The HMAC under NODE_TOTP_ENCRYPTION_KEY, not sha256: six digits is a space of a million,
        // which a plain digest surrenders to anyone holding a database dump.
        expect(record.codeHash).toBe(hashDeliveredCode('123456'));
        expect(record.codeHash).not.toBe(createHash('sha256').update('123456').digest('hex'));
    });
});
