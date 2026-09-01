/**
 * @module
 * The two token-facing lookups on `service.ts` — `findByEmail` and `consumeToken`; a live
 * reset/delete/verify token goes through `accountService.findLiveToken` instead. `findByEmail`
 * uses `findOneWithCredentials` since `select: false` on `tokens` would leave callers pushing
 * onto `undefined`; `consumeToken` pins the one-time-use behaviour the concurrency suite races.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import * as userService from '@modules/users/service';
import { userRepository, hashToken } from '@modules/users';
import type { Token } from '@modules/users';

setupTestDb();

/**
 * A user carrying one reset token and one delete token, so the type half of each filter counts.
 * Seeded with `hashToken`'s output, not the plaintext: this fixture writes `tokens` directly
 * (bypassing `tokenAdd`), so it has to store what production actually stores — a digest —
 * or `consumeToken`'s hashed lookup would never match it.
 */
const createUserWithTokens = () =>
    createUser({
        email: 'tokens@example.com',
        tokens: [
            { type: 'password', token: hashToken('reset-token-value') },
            { type: 'delete', token: hashToken('delete-token-value') }
        ] as Token[]
    });

describe('userService.findByEmail', () => {
    it('finds the account by address', async () => {
        await createUser({ email: 'findme@example.com' });

        const found = await userService.findByEmail('findme@example.com');

        expect(found?.email).toBe('findme@example.com');
    });

    it('returns the tokens array, which select:false would have hidden', async () => {
        // Both callers (reset-request, delete-request) push onto this array immediately. With the
        // ordinary finder it is `undefined` and the push is a TypeError one layer away from here.
        await createUserWithTokens();

        const found = await userService.findByEmail('tokens@example.com');

        expect(Array.isArray(found?.tokens)).toBe(true);
        expect(found?.tokens).toHaveLength(2);
    });

    it('resolves empty for an address nobody holds', async () => {
        await expect(userService.findByEmail('nobody@example.com')).resolves.toBeFalsy();
    });
});

describe('userService.consumeToken', () => {
    it('makes the consumed token unusable on the next lookup', async () => {
        // This is what "one-time" means, expressed as the property rather than as an array length.
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'reset-token-value');

        const reread = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(
            reread?.tokens?.some((entry) => entry.token === hashToken('reset-token-value'))
        ).toBe(false);
    });

    it('leaves the account’s other tokens alone', async () => {
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'reset-token-value');

        const stored = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(stored?.tokens?.map((entry) => entry.token)).toEqual([
            hashToken('delete-token-value')
        ]);
    });

    it('persists the removal rather than only mutating the in-memory document', async () => {
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'delete-token-value');

        const reread = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(
            reread?.tokens?.some((entry) => entry.token === hashToken('delete-token-value'))
        ).toBe(false);
    });

    it('is a no-op for a token the user does not hold', async () => {
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'never-issued');

        const reread = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(reread?.tokens).toHaveLength(2);
    });
});
