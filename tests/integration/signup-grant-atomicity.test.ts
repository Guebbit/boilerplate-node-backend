/**
 * @module
 * Signup and OAuth signup write the `User` row and its starting membership in ONE transaction. A
 * failed grant would otherwise leave the row behind with no membership at all, and the email
 * permanently unable to retry (the unique index, not a fresh signup). Each case forces the grant
 * to fail, and the second one of each pair also breaks the delete a compensating undo would have
 * needed. Cross-module (account writes the user, access's `membershipModel` is what has to be
 * forced to fail), so this lives here rather than in either module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { asStub } from '@tests/stub';
import { accountService } from '@modules/account';
import { userRepository, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { membershipModel } from '@modules/access/model';
import type { ResponseReject } from '@infrastructure/http/response';

setupTestDb();
afterEach(() => jest.restoreAllMocks());

/** Forces the next membership write to reject, the same shape `access.test.ts` uses. */
const failMembershipWritesWith = (failure: Error) =>
    jest.spyOn(membershipModel, 'findOneAndUpdate').mockReturnValue(
        asStub<ReturnType<typeof membershipModel.findOneAndUpdate>>({
            exec: () => Promise.reject(failure)
        })
    );

/** A user-row delete that fails, as the one a compensating undo would rely on could. */
const failUserDeletes = () =>
    jest.spyOn(userRepository, 'deleteOne').mockRejectedValue(new Error('delete failed'));

describe('self-service signup', () => {
    it('undoes the account row when granting its starting role fails, so the email can retry', async () => {
        failMembershipWritesWith(new Error('mongo is down'));

        const result = await accountService.signup(
            {
                email: 'grant-fails@example.com',
                username: 'grantfails',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true
            },
            testCallerContext
        );

        expect((result as ResponseReject).success).toBe(false);
        expect(await userRepository.findOne({ email: 'grant-fails@example.com' })).toBeNull();
    });
});

describe('self-service signup, with nothing to undo it', () => {
    it('leaves no row even when a delete could not have removed it', async () => {
        failMembershipWritesWith(new Error('mongo is down'));
        failUserDeletes();

        const result = await accountService.signup(
            {
                email: 'no-undo@example.com',
                username: 'noundo',
                password: PLAIN_PASSWORD,
                passwordConfirm: PLAIN_PASSWORD,
                analyticsConsent: undefined,
                termsAccepted: true
            },
            testCallerContext
        );

        expect((result as ResponseReject).success).toBe(false);
        expect(await userRepository.findOne({ email: 'no-undo@example.com' })).toBeNull();
    });
});

describe('OAuth signup', () => {
    it('undoes the account row when granting its starting role fails, so the identity can retry', async () => {
        failMembershipWritesWith(new Error('mongo is down'));

        await expect(
            accountService.loginOrCreateFromOAuth(
                'google',
                {
                    providerId: 'subject-fails',
                    email: 'oauth-grant-fails@example.com',
                    emailVerified: true,
                    name: 'OAuth User'
                },
                testCallerContext
            )
        ).rejects.toThrow('mongo is down');

        expect(await userRepository.findOne({ email: 'oauth-grant-fails@example.com' })).toBeNull();
    });
});

describe('OAuth signup, with nothing to undo it', () => {
    it('leaves no row even when a delete could not have removed it', async () => {
        failMembershipWritesWith(new Error('mongo is down'));
        failUserDeletes();

        await expect(
            accountService.loginOrCreateFromOAuth(
                'google',
                {
                    providerId: 'subject-no-undo',
                    email: 'oauth-no-undo@example.com',
                    emailVerified: true,
                    name: 'OAuth User'
                },
                testCallerContext
            )
        ).rejects.toThrow('mongo is down');

        expect(await userRepository.findOne({ email: 'oauth-no-undo@example.com' })).toBeNull();
    });
});
