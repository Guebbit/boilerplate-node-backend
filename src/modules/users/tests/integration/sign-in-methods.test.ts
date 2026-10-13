/**
 * @module
 * The `signInMethods` export section: the providers linked and the second factors armed, as facts.
 * What it must never carry is as much the subject as what it does: the secret behind a device
 * factor, a code in flight and the backup-code digests all sit on the same document.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users/services';

setupTestDb();

/** A fixed moment, so the ISO strings the section answers can be compared exactly. */
const LINKED_AT = new Date('2026-03-01T10:00:00.000Z');

/** A fixed moment a factor was armed. */
const ARMED_AT = new Date('2026-04-02T09:30:00.000Z');

describe('userService.exportSignInMethods', () => {
    it('lists the linked providers and the armed factors, and nothing that opens them', async () => {
        const user = await createUser({
            email: 'ways-in@example.com',
            twoFactorMethods: [
                {
                    method: 'totp',
                    enrolledAt: ARMED_AT,
                    secret: 'encrypted-secret',
                    lastUsedStep: 41
                },
                {
                    method: 'email',
                    enrolledAt: ARMED_AT,
                    codeHash: 'digest-of-a-code-in-flight',
                    codeExpiresAt: new Date(),
                    codeAttempts: 2
                }
            ],
            twoFactorBackupCodes: ['digest-1', 'digest-2'],
            twoFactorBackupCodeSalt: 'salt'
        });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'google',
            providerId: 'subject-1',
            connectedAt: LINKED_AT
        });

        const section = await userService.exportSignInMethods(user.id);

        expect(section).toEqual({
            providers: [
                {
                    provider: 'google',
                    providerId: 'subject-1',
                    connectedAt: LINKED_AT.toISOString()
                }
            ],
            twoFactor: [
                { method: 'totp', enrolledAt: ARMED_AT.toISOString() },
                { method: 'email', enrolledAt: ARMED_AT.toISOString() }
            ]
        });
    });

    it('leaves out a factor whose setup was never confirmed: it guards no login', async () => {
        const user = await createUser({
            email: 'half-way@example.com',
            twoFactorMethods: [{ method: 'totp', secret: 'pending-secret' }]
        });

        await expect(userService.exportSignInMethods(user.id)).resolves.toEqual({
            providers: [],
            twoFactor: []
        });
    });

    it('answers empty lists for an account that holds only a password', async () => {
        const user = await createUser({ email: 'plain@example.com' });

        await expect(userService.exportSignInMethods(user.id)).resolves.toEqual({
            providers: [],
            twoFactor: []
        });
    });

    it('answers nothing for an account that is gone, so the assembly omits the section', async () => {
        await expect(
            userService.exportSignInMethods('64b7f0a1c2d3e4f5a6b7c8d9')
        ).resolves.toBeUndefined();
    });
});
