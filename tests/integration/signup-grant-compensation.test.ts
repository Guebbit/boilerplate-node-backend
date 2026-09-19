/**
 * @module
 * Signup and OAuth signup both write the `User` row BEFORE granting its starting membership —
 * `assignDefaultRole`/`assignRole` need a real id to attach a membership to, so the write must
 * come first. A failed grant used to leave that row behind with no membership at all, and the
 * email permanently unable to retry (the unique index, not a fresh signup). Cross-module (account
 * writes the compensating delete, access's `membershipModel` is what has to be forced to fail),
 * so this lives here rather than in either module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
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
                termsAccepted: true,
                imageUrl: undefined,
                thumbnailUrl: undefined,
                pendingImageKey: undefined
            },
            testCallerContext
        );

        expect((result as ResponseReject).success).toBe(false);
        expect(await userRepository.findOne({ email: 'grant-fails@example.com' })).toBeNull();
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
