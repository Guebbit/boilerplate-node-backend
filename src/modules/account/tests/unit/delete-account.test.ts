import { deleteAccountRequest } from '@modules/account/controllers/delete-account-request';
import { deleteAccountConfirm } from '@modules/account/controllers/delete-account-confirm';
import { userService } from '@modules/users';
import { accountService } from '@modules/account/services';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { authAccountDeleteTotal } from '@modules/account/metrics';

jest.mock('@modules/users', () => ({
    __esModule: true,
    userService: {
        findByEmail: jest.fn(),
        findByAccountDeleteToken: jest.fn()
    }
}));

/*
 * `requestAccountDeletion` and `removeOwnAccount` are the two functions under test here now, not
 * `tokenAdd`/`userService.remove` directly: both moved behind these wrappers this session, along
 * with the audit/analytics emit each one carries — see `profile.ts`/`authentication.ts`. This
 * suite asserts the controller reaches the right wrapper with the right arguments; the emit itself
 * is that wrapper's own unit test's job, not this one's.
 */
jest.mock('@modules/account/services', () => ({
    __esModule: true,
    accountService: {
        requestAccountDeletion: jest.fn(),
        removeOwnAccount: jest.fn()
    }
}));

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
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
const mockFindByAccountDeleteToken = userService.findByAccountDeleteToken as jest.MockedFunction<
    typeof userService.findByAccountDeleteToken
>;
const mockRequestAccountDeletion = accountService.requestAccountDeletion as jest.MockedFunction<
    typeof accountService.requestAccountDeletion
>;
const mockRemoveOwnAccount = accountService.removeOwnAccount as jest.MockedFunction<
    typeof accountService.removeOwnAccount
>;
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;
const mockSuccessResponse = successResponse as jest.MockedFunction<typeof successResponse>;
const mockRejectResponse = rejectResponse as jest.MockedFunction<typeof rejectResponse>;
const mockIncCounter = authAccountDeleteTotal.inc as jest.MockedFunction<() => void>;

const makeResponse = () => ({ locals: {} }) as Parameters<typeof deleteAccountRequest>[1];

describe('DELETE /account — deleteAccountRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends email and returns 200 when user exists', async () => {
        const fakeUser = { email: 'user@example.com', username: 'testuser' };
        mockFindByEmail.mockResolvedValue(fakeUser as never);
        mockRequestAccountDeletion.mockResolvedValue('abc123');
        mockEnqueueEmail.mockResolvedValue();

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
        expect(mockEnqueueEmail).toHaveBeenCalled();
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
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
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
        mockFindByAccountDeleteToken.mockResolvedValue(fakeUser as never);
        mockRemoveOwnAccount.mockResolvedValue({
            success: true,
            status: 200,
            message: '',
            data: undefined
        } as never);
        mockEnqueueEmail.mockResolvedValue();

        const req = { body: { token: 'valid-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockFindByAccountDeleteToken).toHaveBeenCalledWith('valid-token');
        expect(mockRemoveOwnAccount).toHaveBeenCalledWith(fakeUser, expect.anything());
        expect(mockEnqueueEmail).toHaveBeenCalled();
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    it('returns 422 when token is not found', async () => {
        mockFindByAccountDeleteToken.mockResolvedValue(undefined);

        const req = { body: { token: 'bad-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRemoveOwnAccount).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(res, 422, expect.any(Array));
    });

    it('returns 422 when token is expired', async () => {
        const expiredUser = {
            ...fakeUser,
            tokens: [
                {
                    token: 'expired-token',
                    type: 'delete',
                    expiration: new Date(Date.now() - 1000)
                }
            ]
        };
        mockFindByAccountDeleteToken.mockResolvedValue(expiredUser as never);

        const req = { body: { token: 'expired-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRemoveOwnAccount).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(res, 422, expect.any(Array));
    });

    it('returns 500 when service throws', async () => {
        mockFindByAccountDeleteToken.mockRejectedValue(new Error('db error'));

        const req = { body: { token: 'any-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRejectResponse).toHaveBeenCalledWith(res, 500, []);
    });
});
