/**
 * @module
 * The lookups keyed by a value an outsider supplied (an email, a federated identity) refuse an
 * operator object where a string belongs, instead of matching everyone: the sanitized filter
 * reaches the string path as an object and the cast fails.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users/services';
import { userRepository } from '../../repository';

setupTestDb();

/**
 * A query operator standing where the types say a string stands. `JSON.parse` yields `any`, so the
 * single `as string` is the whole lie, and it is the point: Zod keeps this out of the service in
 * production, and these lookups must hold even if it did not.
 */
const operatorAsString = (): string => JSON.parse('{"$ne": null}') as string;

/** What a sanitized operator ends as: a cast failure at the string path, not a wide match. */
const CAST_FAILURE = /Cast to string failed/u;

describe('external-key lookups', () => {
    beforeEach(() =>
        createUser({ email: 'real@example.com', username: 'real' }).then((user) =>
            userRepository.linkOAuthAccount(user.id, {
                provider: 'google',
                providerId: 'sub-1',
                connectedAt: new Date()
            })
        )
    );

    it('an unsanitized lookup WOULD match everyone behind the operator', async () => {
        expect(
            await userRepository.findOne({ email: JSON.parse('{"$ne": null}') as string })
        ).not.toBeNull();
    });

    it('login refuses an operator in place of the email', async () => {
        await expect(userService.findForLogin(operatorAsString())).rejects.toThrow(CAST_FAILURE);
    });

    it('login still finds the real account by its email', async () => {
        expect(await userService.findForLogin('real@example.com')).not.toBeNull();
    });

    it('the reset and delete lookup refuses an operator in place of the email', async () => {
        await expect(userService.findByEmail(operatorAsString())).rejects.toThrow(CAST_FAILURE);
    });

    it('signup refuses an operator in place of the email', async () => {
        await expect(userService.emailTaken(operatorAsString())).rejects.toThrow(CAST_FAILURE);
        expect(await userService.emailTaken('real@example.com')).toBe(true);
    });

    it('an email change refuses an operator in place of the email', async () => {
        await expect(
            userService.emailOrPendingEmailTaken(operatorAsString(), '0'.repeat(24))
        ).rejects.toThrow(CAST_FAILURE);
        expect(await userService.emailOrPendingEmailTaken('real@example.com', '0'.repeat(24))).toBe(
            true
        );
    });

    it('a federated identity refuses an operator in place of the subject', async () => {
        await expect(userService.findByOAuthIdentity('google', operatorAsString())).rejects.toThrow(
            CAST_FAILURE
        );
        expect(await userService.findByOAuthIdentity('google', 'sub-1')).not.toBeNull();
    });

    it('a banned account is still refused by the login lookup, so the trusted operator holds', async () => {
        await createUser({ email: 'banned@example.com', username: 'banned', active: false });

        expect(await userService.findForLogin('banned@example.com')).toBeNull();
        expect(await userRepository.count({ email: 'banned@example.com' })).toBe(1);
    });
});
