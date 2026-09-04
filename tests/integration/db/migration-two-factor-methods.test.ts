/**
 * The one migration in the set with nothing in the seeded data to act on.
 *
 * `20260904030000-two-factor-methods.js` folds the old single-TOTP columns
 * (`twoFactorSecret`, `twoFactorLastUsedStep`) into the `twoFactorMethods` array. No demo user has
 * ever had 2FA armed, so `migration-demo-data.test.ts` runs it against zero matching rows and
 * proves only that it does not throw — which is exactly how a migration reaches production
 * untested and rewrites the first real row wrong.
 *
 * So this writes the OLD shape by hand, at the driver level (the current schema has no path for
 * it), migrates, and reads back what a live account would have become.
 */

import { connect, disconnect } from '@tests/database';
import { nativeDb, runMigrations } from '@tests/migrations';

/** The shape a user document had before the registry — three top-level paths, one factor. */
interface LegacyUser {
    email: string;
    twoFactorSecret?: string;
    twoFactorLastUsedStep?: number;
    twoFactorEnabledAt?: Date;
    twoFactorMethods?: {
        method: string;
        secret?: string;
        enrolledAt?: Date;
        lastUsedStep?: number;
    }[];
}

const ARMED_AT = new Date('2026-08-01T09:00:00.000Z');

beforeAll(connect);
afterAll(disconnect);

/** One user back, by the address it was written under. */
const read = (email: string) => nativeDb().collection<LegacyUser>('users').findOne({ email });

describe('folding the single-TOTP columns into twoFactorMethods', () => {
    beforeAll(async () => {
        await nativeDb()
            .collection<LegacyUser>('users')
            .insertMany([
                {
                    email: 'armed@example.com',
                    twoFactorSecret: 'v1:aa:bb:cc',
                    twoFactorLastUsedStep: 58_000_000,
                    twoFactorEnabledAt: ARMED_AT
                },
                // Setup started, never confirmed — a secret with no `twoFactorEnabledAt`.
                { email: 'pending@example.com', twoFactorSecret: 'v1:dd:ee:ff' },
                { email: 'plain@example.com' }
            ]);

        await runMigrations();
    });

    it('moves an armed factor across with its secret, its replay mark and its date', async () => {
        const user = await read('armed@example.com');

        expect(user?.twoFactorMethods).toEqual([
            {
                method: 'totp',
                secret: 'v1:aa:bb:cc',
                enrolledAt: ARMED_AT,
                lastUsedStep: 58_000_000
            }
        ]);
        // The account-level flag STAYS — narrowed to its one remaining meaning, and the only 2FA
        // field the `User` contract carries.
        expect(user?.twoFactorEnabledAt).toEqual(ARMED_AT);
    });

    it('keeps an unconfirmed enrollment unconfirmed', async () => {
        const user = await read('pending@example.com');

        // No `enrolledAt` rather than a null one: an abandoned setup must not come out of the
        // migration looking like a factor that guards logins.
        expect(user?.twoFactorMethods).toEqual([{ method: 'totp', secret: 'v1:dd:ee:ff' }]);
        expect(user?.twoFactorEnabledAt).toBeUndefined();
    });

    it('leaves the old paths behind', async () => {
        const user = await read('armed@example.com');

        expect(user).not.toHaveProperty('twoFactorSecret');
        expect(user).not.toHaveProperty('twoFactorLastUsedStep');
    });

    it('gives an account that never enrolled an empty array to push onto', async () => {
        const user = await read('plain@example.com');

        // Not merely cosmetic: without the path, the first enrollment would create it implicitly
        // and every read before that would see `undefined` where the schema promises an array.
        expect(user?.twoFactorMethods).toEqual([]);
    });

    it('is idempotent — a second run changes nothing', async () => {
        const before = await read('armed@example.com');

        await runMigrations();

        expect(await read('armed@example.com')).toEqual(before);
    });
});
