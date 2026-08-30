/**
 * The two token-facing lookups on `src/modules/users/service.ts` — `findByEmail` and
 * `consumeToken`. A live reset/delete/verify token is read through `accountService.findLiveToken`
 * instead, which also checks expiration; this file covers only what `service.ts` itself owns.
 *
 * `findByEmail` is a one-liner, and that is precisely why it had no test and why it needs one: it
 * delegates to `findOneWithCredentials` rather than the ordinary finder, and the reason is a
 * comment. `password` and `tokens` carry `select: false` on the schema, so the ordinary finder
 * returns a document whose `tokens` array is `undefined`. Both its callers (reset-request,
 * delete-request) immediately push a token onto that array, so swapping in the plain finder does
 * not fail here — it fails later, as a `TypeError` on `undefined`.
 *
 * `consumeToken` is what makes a reset token one-time; the concurrency suite races two uses of
 * one token past it (`tests/integration/concurrency/`), and these cases pin the serial behaviour
 * that race is measured against. The fixture still plants two token types on one user so
 * "consuming one leaves the other alone" is a real assertion rather than a vacuous one.
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import * as userService from '@modules/users/service';
import { userRepository } from '@modules/users';
import type { Token } from '@modules/users';

setupTestDb();

/** A user carrying one reset token and one delete token, so the type half of each filter counts. */
const createUserWithTokens = () =>
    createUser({
        email: 'tokens@example.com',
        tokens: [
            { type: 'password', token: 'reset-token-value' },
            { type: 'delete', token: 'delete-token-value' }
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
        expect(reread?.tokens?.some((entry) => entry.token === 'reset-token-value')).toBe(false);
    });

    it('leaves the account’s other tokens alone', async () => {
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'reset-token-value');

        const stored = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(stored?.tokens?.map((entry) => entry.token)).toEqual(['delete-token-value']);
    });

    it('persists the removal rather than only mutating the in-memory document', async () => {
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'delete-token-value');

        const reread = await userRepository.findOneWithCredentials({
            email: 'tokens@example.com'
        });
        expect(reread?.tokens?.some((entry) => entry.token === 'delete-token-value')).toBe(false);
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
