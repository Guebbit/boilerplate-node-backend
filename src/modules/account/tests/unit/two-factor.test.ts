/**
 * @module
 * `account/two-factor.ts` — the pure crypto layer, no database in the loop. Encryption round-trips
 * against a real key, TOTP codes are generated and verified against fixed clocks (never wall time),
 * and backup codes hash the same way `hashToken` always has.
 */

import { generate } from 'otplib';
import {
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
