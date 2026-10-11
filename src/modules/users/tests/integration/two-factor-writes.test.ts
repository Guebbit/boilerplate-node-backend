/**
 * @module
 * `persistTwoFactorMethods` writes only what the caller changed, per method, in one atomic update
 * — never the whole array as it was loaded. Each case holds two loaded copies of one account and
 * lets them write in turn: the shape of two requests in flight.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '../../services';
import { versionOf } from '@infrastructure/persistence/versioning';
import type { TwoFactorMethodRecord, UserDocument } from '../../model';

setupTestDb();

/** An armed device factor and an armed delivered one, the two shapes an account holds together. */
const ARMED: TwoFactorMethodRecord[] = [
    { method: 'totp', enrolledAt: new Date(), secret: 'ciphertext', lastUsedStep: 10 },
    {
        method: 'email',
        enrolledAt: new Date(),
        codeHash: 'digest',
        codeSentAt: new Date(),
        codeExpiresAt: new Date(Date.now() + 600_000),
        codeAttempts: 1
    }
];

/** One loaded copy of the account, credentials included — what a request holds. */
const load = async (id: string): Promise<UserDocument> => {
    const user = await userService.findByIdWithCredentials(id);
    if (!user) throw new Error('fixture user is missing');
    return user;
};

/** One field of one method's stored entry, read back fresh. */
const field = async (
    id: string,
    method: string,
    key: keyof TwoFactorMethodRecord
): Promise<unknown> => {
    const user = await load(id);
    return user.twoFactorMethods.find((entry) => entry.method === method)?.[key];
};

/** The entry of one method on a loaded copy; a missing one is a broken fixture. */
const entryOf = (user: UserDocument, method: string): TwoFactorMethodRecord => {
    const entry = user.twoFactorMethods.find((candidate) => candidate.method === method);
    if (!entry) throw new Error(`fixture has no ${method} entry`);
    return entry;
};

describe('persistTwoFactorMethods', () => {
    it('leaves a TOTP step another request claimed after this copy was loaded', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const slow = await load(id);

        // This request accepts step 11 …
        expect(await userService.claimTotpStep(id, 'totp', 11)).toBe(true);
        entryOf(slow, 'totp').lastUsedStep = 11;
        // … and a faster one accepts step 12 before this one gets to write.
        expect(await userService.claimTotpStep(id, 'totp', 12)).toBe(true);

        await userService.persistTwoFactorMethods(slow);

        expect(await field(id, 'totp', 'lastUsedStep')).toBe(12);
    });

    it('lets two requests that touch different methods both land, without a lost-race error', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const first = await load(id);
        const second = await load(id);

        entryOf(first, 'email').codeAttempts = 2;
        entryOf(second, 'totp').secret = 'rotated';
        await userService.persistTwoFactorMethods(first);
        await userService.persistTwoFactorMethods(second);

        expect(await field(id, 'email', 'codeAttempts')).toBe(2);
        expect(await field(id, 'totp', 'secret')).toBe('rotated');
    });

    it('clears a field the caller unset, and only that one', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const user = await load(id);
        const email = entryOf(user, 'email');

        email.codeHash = undefined;
        email.codeAttempts = undefined;
        await userService.persistTwoFactorMethods(user);

        const after = entryOf(await load(id), 'email');
        expect(after.codeHash).toBeUndefined();
        expect(after.codeAttempts).toBeUndefined();
        expect(after.codeSentAt).toBeInstanceOf(Date);
        expect(after.enrolledAt).toBeInstanceOf(Date);
    });

    it('writes a method added after the copy was loaded, beside the ones already there', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: [ARMED[0]]
        });
        const user = await load(id);

        user.twoFactorMethods.push({ method: 'email', codeHash: 'fresh' });
        await userService.persistTwoFactorMethods(user);

        const reloaded = await load(id);
        expect(reloaded.twoFactorMethods.map((entry) => entry.method)).toEqual(['totp', 'email']);
        expect(entryOf(reloaded, 'email').codeHash).toBe('fresh');
    });

    it('drops only the named method, keeping a concurrent change to the other', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const remover = await load(id);
        const bystander = await load(id);

        entryOf(bystander, 'email').codeAttempts = 4;
        await userService.persistTwoFactorMethods(bystander);

        remover.twoFactorMethods.splice(
            remover.twoFactorMethods.findIndex((entry) => entry.method === 'totp'),
            1
        );
        await userService.persistTwoFactorMethods(remover, ['totp']);

        const reloaded = await load(id);
        expect(reloaded.twoFactorMethods.map((entry) => entry.method)).toEqual(['email']);
        expect(entryOf(reloaded, 'email').codeAttempts).toBe(4);
    });

    it('drops every method when told "all"', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const user = await load(id);

        user.twoFactorMethods = [];
        await userService.persistTwoFactorMethods(user, 'all');

        const reloaded = await load(id);
        expect(reloaded.twoFactorMethods).toHaveLength(0);
    });

    it('carries the account-level fields of the same write, in that one update', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const user = await load(id);
        const epoch = new Date();

        entryOf(user, 'totp').enrolledAt = undefined;
        user.twoFactorBackupCodes = ['digest-a'];
        userService.markSessionsEnded(user, epoch);
        await userService.persistTwoFactorMethods(user);

        const after = await load(id);
        expect(after.twoFactorBackupCodes).toEqual(['digest-a']);
        expect(after.tokensValidAfter).toEqual(epoch);
        expect(entryOf(after, 'totp').enrolledAt).toBeUndefined();
    });

    it('keeps one entry per method when two requests both started the same enrollment', async () => {
        const { id } = await createUser({ twoFactorEnabledAt: new Date().toISOString() });
        const first = await load(id);
        const second = await load(id);

        first.twoFactorMethods.push({ method: 'totp', secret: 'first' });
        second.twoFactorMethods.push({ method: 'totp', secret: 'second' });
        await userService.persistTwoFactorMethods(first);
        await userService.persistTwoFactorMethods(second);

        const reloaded = await load(id);
        expect(reloaded.twoFactorMethods).toHaveLength(1);
        expect(entryOf(reloaded, 'totp').secret).toBe('second');
    });

    it('sends nothing, and moves nothing, when the copy has no change to write', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const before = await load(id);

        await userService.persistTwoFactorMethods(before);

        const after = await load(id);
        expect(versionOf(after)).toBe(versionOf(before));
        expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('is not an edit of the account: a real change leaves its version and updatedAt alone', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const user = await load(id);

        entryOf(user, 'email').codeAttempts = 2;
        await userService.persistTwoFactorMethods(user);

        const after = await load(id);
        expect(versionOf(after)).toBe(versionOf(user));
        expect(after.updatedAt).toEqual(user.updatedAt);
    });

    it('settles the copy, so a second persist does not resend what the first one wrote', async () => {
        const { id } = await createUser({
            twoFactorEnabledAt: new Date().toISOString(),
            twoFactorMethods: ARMED
        });
        const user = await load(id);

        entryOf(user, 'email').codeAttempts = 3;
        await userService.persistTwoFactorMethods(user);
        // Another request moves the counter on; a settled copy must not put its own 3 back.
        const other = await load(id);
        entryOf(other, 'email').codeAttempts = 4;
        await userService.persistTwoFactorMethods(other);
        await userService.persistTwoFactorMethods(user);

        expect(await field(id, 'email', 'codeAttempts')).toBe(4);
    });
});
