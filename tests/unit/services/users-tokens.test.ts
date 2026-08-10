/**
 * The four token-facing lookups in `src/services/users.ts` — `findByEmail`,
 * `findByPasswordResetToken`, `findByAccountDeleteToken` and `consumeToken`.
 *
 * They are one-liners, and that is precisely why they had no tests and why they need them: each
 * delegates to `findOneWithCredentials` rather than the ordinary finder, and the reason is a
 * comment. `password` and `tokens` carry `select: false` on the schema, so the ordinary finder
 * returns a document whose `tokens` array is `undefined`. Every caller of these three immediately
 * reads or pushes a token, so swapping in the plain finder does not fail here — it fails later,
 * in the reset and delete flows, as a `TypeError` on `undefined`.
 *
 * The other invariant worth pinning is the pairing of token *value* with token *type*. The two
 * lookups differ only in the `tokens.type` half of their filter, so dropping it from either one
 * leaves both green against a single-token fixture — and turns a password-reset token into a
 * usable account-deletion token. Each case below therefore plants both kinds on one user and
 * asserts the lookup does not answer to the other's token.
 *
 * `consumeToken` is what makes a reset token one-time; the concurrency suite races two uses of
 * one token past it (`tests/integration/concurrency/`), and these cases pin the serial behaviour
 * that race is measured against.
 */
import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser } from '../../helpers/factories/users';
import * as userService from '@services/users';
import { userRepository } from '@repositories/users';
import type { IToken } from '@models/users';

setupTestDb();

/** A user carrying one reset token and one delete token, so the type half of each filter counts. */
const createUserWithTokens = () =>
    createUser({
        email: 'tokens@example.com',
        tokens: [
            { type: 'password', token: 'reset-token-value' },
            { type: 'delete', token: 'delete-token-value' }
        ] as IToken[]
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

describe('userService.findByPasswordResetToken', () => {
    it('finds the holder of a reset token', async () => {
        const user = await createUserWithTokens();

        const found = await userService.findByPasswordResetToken('reset-token-value');

        expect(found?.id).toBe(user.id);
    });

    it('refuses a delete token, so one token type cannot stand in for the other', async () => {
        await createUserWithTokens();

        await expect(
            userService.findByPasswordResetToken('delete-token-value')
        ).resolves.toBeFalsy();
    });

    it('returns the token entries so the caller can read the expiration', async () => {
        await createUserWithTokens();

        const found = await userService.findByPasswordResetToken('reset-token-value');

        expect(found?.tokens?.some((entry) => entry.token === 'reset-token-value')).toBe(true);
    });

    it('resolves empty for a token nobody holds', async () => {
        await createUserWithTokens();

        await expect(userService.findByPasswordResetToken('invented')).resolves.toBeFalsy();
    });
});

describe('userService.findByAccountDeleteToken', () => {
    it('finds the holder of a delete token', async () => {
        const user = await createUserWithTokens();

        const found = await userService.findByAccountDeleteToken('delete-token-value');

        expect(found?.id).toBe(user.id);
    });

    it('refuses a reset token, so a password reset cannot delete an account', async () => {
        await createUserWithTokens();

        await expect(
            userService.findByAccountDeleteToken('reset-token-value')
        ).resolves.toBeFalsy();
    });

    it('resolves empty for a token nobody holds', async () => {
        await createUserWithTokens();

        await expect(userService.findByAccountDeleteToken('invented')).resolves.toBeFalsy();
    });
});

describe('userService.consumeToken', () => {
    it('makes the consumed token unusable on the next lookup', async () => {
        // This is what "one-time" means, expressed as the property rather than as an array length.
        const user = await createUserWithTokens();

        await userService.consumeToken(user, 'reset-token-value');

        await expect(
            userService.findByPasswordResetToken('reset-token-value')
        ).resolves.toBeFalsy();
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
