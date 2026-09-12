/**
 * @module
 * `kernel/seed-accounts.ts` — the two demo identities, and the env vars that override their
 * passwords. The overrides are read at module scope, so every case that exercises one reloads
 * the module rather than mutating an already-evaluated constant.
 */
import { Types } from 'mongoose';
import { zodUserSchema } from '@modules/users';
import {
    SEED_OWNER_ID,
    SEED_USER_ID,
    SEED_OWNER_EMAIL,
    SEED_USER_EMAIL,
    SEED_OWNER_PASSWORD,
    SEED_USER_PASSWORD,
    seedCredentials
} from '@kernel/seed-accounts';

/** Every seed password override var, restored after each `hasFallbackSeedPassword` case. */
const ALL_PASSWORD_KEYS = [
    'NODE_SEED_ADMIN_PASSWORD',
    'NODE_SEED_USER_PASSWORD',
    'NODE_SEED_EDITOR_PASSWORD',
    'NODE_SEED_MODERATOR_PASSWORD'
] as const;

/** What every password-setting endpoint enforces, reduced to a yes/no. */
const satisfiesPolicy = (password: string): boolean =>
    zodUserSchema.pick({ password: true }).safeParse({ password }).success;

/** The two override vars, saved so a case that sets one restores whatever was there. */
const ORIGINAL = {
    admin: process.env.NODE_SEED_ADMIN_PASSWORD,
    user: process.env.NODE_SEED_USER_PASSWORD
};

/** Reloads the module with the two vars set as given, so the constants re-evaluate. */
const reloadWith = async (admin: string | undefined, user: string | undefined) => {
    if (admin === undefined) delete process.env.NODE_SEED_ADMIN_PASSWORD;
    else process.env.NODE_SEED_ADMIN_PASSWORD = admin;
    if (user === undefined) delete process.env.NODE_SEED_USER_PASSWORD;
    else process.env.NODE_SEED_USER_PASSWORD = user;

    jest.resetModules();
    return import('@kernel/seed-accounts');
};

afterEach(() => {
    if (ORIGINAL.admin === undefined) delete process.env.NODE_SEED_ADMIN_PASSWORD;
    else process.env.NODE_SEED_ADMIN_PASSWORD = ORIGINAL.admin;
    if (ORIGINAL.user === undefined) delete process.env.NODE_SEED_USER_PASSWORD;
    else process.env.NODE_SEED_USER_PASSWORD = ORIGINAL.user;
    jest.resetModules();
});

describe('the demo identities', () => {
    it('names two distinct accounts by a real ObjectId', () => {
        expect(Types.ObjectId.isValid(SEED_OWNER_ID)).toBe(true);
        expect(Types.ObjectId.isValid(SEED_USER_ID)).toBe(true);
        expect(SEED_OWNER_ID).not.toBe(SEED_USER_ID);
    });

    it('gives each account its own login address', () => {
        expect(SEED_OWNER_EMAIL).not.toBe(SEED_USER_EMAIL);
    });
});

describe('the seeded passwords', () => {
    /*
     * The constraint that actually bites: the demo profile creates these accounts through the
     * same schema every signup goes through, so a fallback the policy refuses means `npm run demo`
     * boots without the accounts the frontend's e2e suite logs in as.
     */
    it('satisfies the policy every password-setting endpoint enforces', () => {
        expect(satisfiesPolicy(SEED_OWNER_PASSWORD)).toBe(true);
        expect(satisfiesPolicy(SEED_USER_PASSWORD)).toBe(true);
    });

    it('falls back to a usable value when neither env var is set', async () => {
        const seeds = await reloadWith(undefined, undefined);

        expect(seeds.SEED_OWNER_PASSWORD).not.toBe('');
        expect(seeds.SEED_USER_PASSWORD).not.toBe('');
        expect(satisfiesPolicy(seeds.SEED_OWNER_PASSWORD)).toBe(true);
        expect(satisfiesPolicy(seeds.SEED_USER_PASSWORD)).toBe(true);
    });

    it('takes each password from its own env var when one is set', async () => {
        const seeds = await reloadWith('Env-Admin1!', 'Env-User1!');

        expect(seeds.SEED_OWNER_PASSWORD).toBe('Env-Admin1!');
        expect(seeds.SEED_USER_PASSWORD).toBe('Env-User1!');
    });

    it('overrides one account without touching the other', async () => {
        const fallbacks = await reloadWith(undefined, undefined);
        const seeds = await reloadWith('Env-Admin1!', undefined);

        expect(seeds.SEED_OWNER_PASSWORD).toBe('Env-Admin1!');
        expect(seeds.SEED_USER_PASSWORD).toBe(fallbacks.SEED_USER_PASSWORD);
    });
});

describe('seedCredentials', () => {
    /*
     * The paired frontend keeps its own literal login list
     * (`<paired-frontend>/tests/support/e2e/accounts.ts`), not a copy read from this repo — so a
     * constant changed here without its entry hands the frontend's suite a password the seeded
     * account does not actually have, with nothing on either side to notice.
     */
    it('publishes exactly what each account was seeded with', () => {
        expect(seedCredentials.owner).toEqual({
            email: SEED_OWNER_EMAIL,
            password: SEED_OWNER_PASSWORD
        });
        expect(seedCredentials.user).toEqual({
            email: SEED_USER_EMAIL,
            password: SEED_USER_PASSWORD
        });
    });

    it('carries the overridden password, not the fallback', async () => {
        const seeds = await reloadWith('Env-Admin1!', 'Env-User1!');

        expect(seeds.seedCredentials.owner.password).toBe('Env-Admin1!');
        expect(seeds.seedCredentials.user.password).toBe('Env-User1!');
    });
});

describe('hasFallbackSeedPassword', () => {
    const original = new Map(ALL_PASSWORD_KEYS.map((key) => [key, process.env[key]]));

    /** Reloads with all four override vars set as given, so every fallback re-evaluates. */
    const reloadAllWith = async (
        overrides: Partial<Record<(typeof ALL_PASSWORD_KEYS)[number], string>>
    ) => {
        for (const key of ALL_PASSWORD_KEYS) {
            const value = overrides[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        jest.resetModules();
        return import('@kernel/seed-accounts');
    };

    afterEach(() => {
        for (const [key, value] of original)
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        jest.resetModules();
    });

    it('is true when every account is still its committed fallback', async () => {
        const seeds = await reloadAllWith({});

        expect(seeds.hasFallbackSeedPassword()).toBe(true);
    });

    it('is true when even one account was never overridden', async () => {
        const seeds = await reloadAllWith({
            NODE_SEED_ADMIN_PASSWORD: 'Env-Admin1!',
            NODE_SEED_USER_PASSWORD: 'Env-User1!',
            NODE_SEED_EDITOR_PASSWORD: 'Env-Editor1!'
            // Moderator left at its fallback on purpose — this is the case this function exists for.
        });

        expect(seeds.hasFallbackSeedPassword()).toBe(true);
    });

    it('is false once every account has its own password', async () => {
        const seeds = await reloadAllWith({
            NODE_SEED_ADMIN_PASSWORD: 'Env-Admin1!',
            NODE_SEED_USER_PASSWORD: 'Env-User1!',
            NODE_SEED_EDITOR_PASSWORD: 'Env-Editor1!',
            NODE_SEED_MODERATOR_PASSWORD: 'Env-Moderator1!'
        });

        expect(seeds.hasFallbackSeedPassword()).toBe(false);
    });
});
