/**
 * @module
 * `deleteAccountRequest` and `deleteAccountConfirm` — two-step account deletion, at the wiring
 * level. Pins enumeration prevention: an unknown email answers 200 like a known one, and a
 * spent or never-live token both refuse with the same 422, so neither leaks which case happened.
 * Every collaborator is mocked; mail content is asserted in `emails.test.ts`.
 */

import { deleteAccountRequest } from '@modules/account/controllers/delete-account-request';
import { deleteAccountConfirm } from '@modules/account/controllers/delete-account-confirm';
import { userService } from '@modules/users';
import { accountService } from '@modules/account/services';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { authAccountDeleteTotal } from '@modules/account/metrics';

jest.mock('@modules/users', () => ({
    __esModule: true,
    userService: {
        findByEmail: jest.fn()
    }
}));

/*
 * `requestAccountDeletion` and `removeOwnAccount` are under test here, not `tokenAdd` /
 * `userService.remove` directly — both sit behind these wrappers, along with the audit/analytics
 * emit each carries (see `profile.ts`/`authentication.ts`). The emit itself is that wrapper's
 * own unit test's job, not this one's.
 */
jest.mock('@modules/account/services', () => ({
    __esModule: true,
    accountService: {
        findLiveToken: jest.fn(),
        spendLiveToken: jest.fn(),
        requestAccountDeletion: jest.fn(),
        removeOwnAccount: jest.fn()
    }
}));

jest.mock('@infrastructure/http/response', () => ({
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

jest.mock('@modules/account/metrics', () => ({
    __esModule: true,
    authAccountDeleteTotal: { inc: jest.fn() }
}));

// The controller reaches `../cookies` directly; see the note in `token-cleanup.test.ts`.
jest.mock('@modules/account/session/cookies', () => ({
    __esModule: true,
    destroyRefreshCookie: jest.fn(),
    destroyLoggedCookie: jest.fn()
}));

const mockFindByEmail = userService.findByEmail as jest.MockedFunction<
    typeof userService.findByEmail
>;
const mockFindLiveToken = accountService.findLiveToken as jest.MockedFunction<
    typeof accountService.findLiveToken
>;
const mockSpendLiveToken = accountService.spendLiveToken as jest.MockedFunction<
    typeof accountService.spendLiveToken
>;
const mockRequestAccountDeletion = accountService.requestAccountDeletion as jest.MockedFunction<
    typeof accountService.requestAccountDeletion
>;
const mockRemoveOwnAccount = accountService.removeOwnAccount as jest.MockedFunction<
    typeof accountService.removeOwnAccount
>;
const mockSuccessResponse = successResponse as jest.MockedFunction<typeof successResponse>;
const mockRejectResponse = rejectResponse as jest.MockedFunction<typeof rejectResponse>;
const mockIncCounter = authAccountDeleteTotal.inc as jest.MockedFunction<() => void>;

const makeResponse = () => ({ locals: {} }) as Parameters<typeof deleteAccountRequest>[1];

describe('DELETE /account — deleteAccountRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends email and returns 200 when user exists', async () => {
        const fakeUser = { email: 'user@example.com', username: 'testuser' };
        mockFindByEmail.mockResolvedValue(fakeUser as never);
        mockRequestAccountDeletion.mockResolvedValue();

        const req = {
            authContext: {
                id: 'uid1',
                email: 'user@example.com',
                username: 'testuser',
                admin: false
            }
        };
        const res = makeResponse();

        await deleteAccountRequest(req as never, res);

        expect(mockFindByEmail).toHaveBeenCalledWith('user@example.com');
        expect(mockRequestAccountDeletion).toHaveBeenCalledWith(fakeUser, expect.anything());
        // No mail assertion here on purpose: `requestAccountDeletion` mints the token AND sends
        // the link, so the controller has nothing to publish. That the mail goes out is the
        // service's own test's claim — see `self-service.test.ts`.
        expect(mockIncCounter).toHaveBeenCalledWith({ status: 'success' });
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    it('returns 200 silently when user is not found (enumeration prevention)', async () => {
        mockFindByEmail.mockResolvedValue(undefined);

        const req = {
            authContext: { id: 'uid1', email: 'ghost@example.com', username: 'ghost', admin: false }
        };
        const res = makeResponse();

        await deleteAccountRequest(req as never, res);

        expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
        expect(mockIncCounter).toHaveBeenCalledWith({ status: 'failure' });
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    it('returns 500 when service throws', async () => {
        mockFindByEmail.mockRejectedValue(new Error('db error'));

        const req = {
            authContext: { id: 'uid1', email: 'user@example.com', username: 'user', admin: false }
        };
        const res = makeResponse();

        await deleteAccountRequest(req as never, res);

        expect(mockRejectResponse).toHaveBeenCalledWith(res, 500, []);
    });
});

describe('DELETE /account/delete-confirm — deleteAccountConfirm', () => {
    const fakeUser = {
        _id: 'uid1',
        email: 'user@example.com',
        username: 'testuser',
        admin: false,
        tokens: [
            { token: 'valid-token', type: 'delete', expiration: new Date(Date.now() + 3_600_000) }
        ]
    };

    beforeEach(() => jest.clearAllMocks());

    it('deletes account and returns 200 for valid token', async () => {
        mockFindLiveToken.mockResolvedValue(fakeUser as never);
        mockSpendLiveToken.mockResolvedValue(true);
        mockRemoveOwnAccount.mockResolvedValue({
            success: true,
            status: 200,
            message: '',
            data: undefined
        } as never);

        const req = { body: { token: 'valid-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockFindLiveToken).toHaveBeenCalledWith('delete', 'valid-token');
        expect(mockSpendLiveToken).toHaveBeenCalledWith(fakeUser, 'valid-token');
        expect(mockRemoveOwnAccount).toHaveBeenCalledWith(fakeUser, expect.anything());
        // The goodbye mail is `removeOwnAccount`'s: it is the last layer that can still read the
        // address, since the account is gone once it resolves.
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    // The loser of two simultaneous confirms: `findLiveToken` still finds the entry (a read), but
    // `spendLiveToken`'s atomic `$pull` reports it was already taken — same refusal as a dead link.
    it('returns 422 when the token was already spent by a concurrent request', async () => {
        mockFindLiveToken.mockResolvedValue(fakeUser as never);
        mockSpendLiveToken.mockResolvedValue(false);

        const req = { body: { token: 'valid-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRemoveOwnAccount).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(res, 422, expect.any(Array));
    });

    /*
     * Expiry is no longer visible here, and that is the point: `findLiveToken` refuses an expired
     * entry by answering `undefined`, exactly as it answers for a token that never existed, so
     * this controller has one refusal path rather than three. What "live" means is asserted where
     * it is now decided — `self-service.test.ts`, against a real document.
     */
    it('returns 422 when the token is not live', async () => {
        mockFindLiveToken.mockResolvedValue(undefined);

        const req = { body: { token: 'expired-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRemoveOwnAccount).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(res, 422, expect.any(Array));
    });

    it('returns 500 when service throws', async () => {
        mockFindLiveToken.mockRejectedValue(new Error('db error'));

        const req = { body: { token: 'any-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRejectResponse).toHaveBeenCalledWith(res, 500, []);
    });
});
