/**
 * @module
 * `account/two-factor/` — the pure layers, no database in the loop. Encryption round-trips against
 * a real key, TOTP codes are generated and verified against fixed clocks (never wall time), backup
 * codes hash under a per-user salt rather than a bare digest, and a delivered code's TTL, cooldown
 * and attempt ceiling are driven against an injected clock rather than a timer.
 */

import { createHash, createHmac } from 'node:crypto';
import { getPrometheusMetrics } from '@infrastructure/observability/metrics-registry';
import '../../two-factor/registry';
import { getTotpEncryptionKeyRing } from '../../session/config';
import { generate, generateSecret } from 'otplib';
import type { TwoFactorMethodRecord } from '@modules/users';
import {
    armDeliveredCode,
    checkDeliveredCode,
    deliveryCooldownRemaining,
    generateDeliveredCode,
    hashDeliveredCode,
    DELIVERED_CODE_MAX_ATTEMPTS,
    DELIVERED_CODE_RESEND_SECONDS,
    DELIVERED_CODE_TTL_MS,
    encryptTotpSecret,
    decryptTotpSecret,
    buildOtpauthUri,
    verifyTotpCode,
    generateBackupCodes,
    generateBackupCodeSalt,
    hashBackupCode,
    BACKUP_CODE_COUNT
} from '../../two-factor';

// The crypto and version-mismatch behaviour itself is `versioned-secret.ts`'s, tested once in
// `tests/unit/infrastructure/security/versioned-secret.test.ts` — this just holds the wiring.
describe('TOTP secret encryption', () => {
    it('round-trips a secret through encrypt then decrypt, under the configured TOTP key', () => {
        const secret = generateSecret();

        expect(decryptTotpSecret(encryptTotpSecret(secret, 'method-1'), 'method-1')).toBe(secret);
    });

    it('refuses a secret copied onto another method entry', () => {
        const stored = encryptTotpSecret(generateSecret(), 'method-1');

        expect(() => decryptTotpSecret(stored, 'method-2')).toThrow();
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
        const secret = generateSecret();
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
        const secret = generateSecret();
        const wrong = await generate({ secret, epoch: FIXED_EPOCH_SECONDS + 3600 }); // an hour away

        jest.useFakeTimers().setSystemTime(FIXED_EPOCH_SECONDS * 1000);
        try {
            await expect(verifyTotpCode(secret, wrong)).resolves.toEqual({ valid: false });
        } finally {
            jest.useRealTimers();
        }
    });

    it('rejects a code at or before the given time step — replay protection', async () => {
        const secret = generateSecret();
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

    it('mints a fresh salt each call', () => {
        expect(generateBackupCodeSalt()).not.toBe(generateBackupCodeSalt());
    });

    it('hashes deterministically under the same salt, so a stored digest can be matched against a re-hash', () => {
        const [code] = generateBackupCodes();
        const salt = generateBackupCodeSalt();

        expect(hashBackupCode(code, salt)).toBe(hashBackupCode(code, salt));
    });

    it('hashes two different codes, under the same salt, to two different digests', () => {
        const [first, second] = generateBackupCodes();
        const salt = generateBackupCodeSalt();

        expect(hashBackupCode(first, salt)).not.toBe(hashBackupCode(second, salt));
    });

    it('hashes the same code under two different salts to two different digests', () => {
        const [code] = generateBackupCodes();

        expect(hashBackupCode(code, generateBackupCodeSalt())).not.toBe(
            hashBackupCode(code, generateBackupCodeSalt())
        );
    });
});

/** A bare method entry, the shape `services/two-factor-enrollment.ts` hands a handler. */
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

    it.each([
        ['the code it armed', '123456', 0, 0, 'match'],
        ['a wrong code', '000000', 0, 0, 'miss'],
        ['a wrong code with attempts left', '000000', DELIVERED_CODE_MAX_ATTEMPTS - 1, 0, 'miss'],
        [
            'the right code past the attempt ceiling',
            '123456',
            DELIVERED_CODE_MAX_ATTEMPTS,
            0,
            'none'
        ],
        ['the right code at the expiry instant', '123456', 0, DELIVERED_CODE_TTL_MS, 'expired'],
        ['the right code after expiry', '123456', 0, DELIVERED_CODE_TTL_MS + 1, 'expired'],
        ['the right code just before expiry', '123456', 0, DELIVERED_CODE_TTL_MS - 1, 'match']
    ])('answers %s with the verdict it earns', (_label, typed, attempts, elapsed, verdict) => {
        const record = entry();
        armDeliveredCode(record, '123456', now);
        record.codeAttempts = attempts;

        expect(checkDeliveredCode(record, typed, new Date(now.getTime() + elapsed))).toBe(verdict);
    });

    it('answers none when nothing is in flight, or the expiry is missing', () => {
        const record = entry();
        expect(checkDeliveredCode(record, '123456', now)).toBe('none');

        armDeliveredCode(record, '123456', now);
        record.codeExpiresAt = undefined;
        expect(checkDeliveredCode(record, '123456', now)).toBe('none');
    });

    it('changes nothing: a check is not a spend', () => {
        const record = entry();
        armDeliveredCode(record, '123456', now);

        checkDeliveredCode(record, '123456', now);
        checkDeliveredCode(record, '000000', now);

        expect(record.codeHash).toBeDefined();
        expect(record.codeAttempts).toBe(0);
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

    it('does not MAC under the raw AES key: one key, one purpose', () => {
        const rawKeyMac = createHmac('sha256', getTotpEncryptionKeyRing()[0].key)
            .update('123456')
            .digest('hex');

        expect(hashDeliveredCode('123456')).not.toBe(rawKeyMac);
    });
});

describe('the disable counter', () => {
    it('starts at 0 for every method, so the failure alert sees the first one after a restart', async () => {
        const metrics = await getPrometheusMetrics();

        expect(metrics).toMatch(
            /^auth_two_factor_disable_total\{method="totp",status="failure"\} 0$/m
        );
    });
});
