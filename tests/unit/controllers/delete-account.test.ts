import { deleteAccountRequest } from '@controllers/account/delete-account-request';
import { deleteAccountConfirm } from '@controllers/account/delete-account-confirm';
import { userService } from '@services/users';
import { authService } from '@services/auth';
import { enqueueEmail } from '@utils/nodemailer';
import { successResponse, rejectResponse } from '@utils/response';
import { emitAuditEvent } from '@utils/audit';
import { authAccountDeleteTotal } from '@utils/domain-metrics';

jest.mock('@services/users', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    userService: {
        findByEmail: jest.fn(),
        findByAccountDeleteToken: jest.fn(),
        remove: jest.fn()
    }
}));

jest.mock('@services/auth', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    authService: {
        tokenAdd: jest.fn()
    }
}));

jest.mock('@utils/nodemailer', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    enqueueEmail: jest.fn()
}));

jest.mock('@utils/response', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    successResponse: jest.fn(),
    rejectResponse: jest.fn()
}));

jest.mock('@utils/audit', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    emitAuditEvent: jest.fn(),
    AuditAction: {
        AUTH_ACCOUNT_DELETE_REQUESTED: 'auth.account_delete.requested',
        AUTH_ACCOUNT_DELETE_COMPLETED: 'auth.account_delete.completed'
    },
    buildAuditEvent: jest.fn().mockReturnValue({})
}));

jest.mock('@utils/analytics', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    emitAnalyticsEvent: jest.fn(),
    AnalyticsEvent: {
        ACCOUNT_DELETED: 'account_deleted'
    }
}));

jest.mock('@utils/domain-metrics', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    authAccountDeleteTotal: { inc: jest.fn() }
}));

jest.mock('@middlewares/auth-jwt', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
const mockRemove = userService.remove as jest.MockedFunction<typeof userService.remove>;
const mockTokenAdd = authService.tokenAdd as jest.MockedFunction<typeof authService.tokenAdd>;
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;
const mockSuccessResponse = successResponse as jest.MockedFunction<typeof successResponse>;
const mockRejectResponse = rejectResponse as jest.MockedFunction<typeof rejectResponse>;
const mockEmitAuditEvent = emitAuditEvent as jest.MockedFunction<typeof emitAuditEvent>;
const mockIncCounter = authAccountDeleteTotal.inc as jest.MockedFunction<() => void>;

const makeResponse = () => ({ locals: {} }) as Parameters<typeof deleteAccountRequest>[1];

describe('DELETE /account — deleteAccountRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends email and returns 200 when user exists', async () => {
        const fakeUser = { email: 'user@example.com', username: 'testuser' };
        mockFindByEmail.mockResolvedValue(fakeUser as never);
        mockTokenAdd.mockResolvedValue('abc123');
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
        expect(mockTokenAdd).toHaveBeenCalledWith(fakeUser, 'delete', 3_600_000);
        expect(mockEnqueueEmail).toHaveBeenCalled();
        expect(mockEmitAuditEvent).toHaveBeenCalled();
        expect(mockIncCounter).toHaveBeenCalledWith({ status: 'success' });
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    it('returns 200 silently when user is not found (enumeration prevention)', async () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        mockFindByEmail.mockResolvedValue(undefined);

        const req = {
            authContext: { id: 'uid1', email: 'ghost@example.com', username: 'ghost', admin: false }
        };
        const res = makeResponse();

        await deleteAccountRequest(req as never, res);

        expect(mockTokenAdd).not.toHaveBeenCalled();
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

        expect(mockRejectResponse).toHaveBeenCalledWith(res, 500, 'deleteAccountRequest', []);
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
        mockRemove.mockResolvedValue({
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
        expect(mockRemove).toHaveBeenCalledWith(fakeUser, true);
        expect(mockEnqueueEmail).toHaveBeenCalled();
        expect(mockEmitAuditEvent).toHaveBeenCalled();
        expect(mockSuccessResponse).toHaveBeenCalled();
    });

    it('returns 422 when token is not found', async () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        mockFindByAccountDeleteToken.mockResolvedValue(undefined);

        const req = { body: { token: 'bad-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRemove).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(
            res,
            422,
            'deleteAccountConfirm - invalid token',
            expect.any(Array)
        );
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

        expect(mockRemove).not.toHaveBeenCalled();
        expect(mockRejectResponse).toHaveBeenCalledWith(
            res,
            422,
            'deleteAccountConfirm - expired token',
            expect.any(Array)
        );
    });

    it('returns 500 when service throws', async () => {
        mockFindByAccountDeleteToken.mockRejectedValue(new Error('db error'));

        const req = { body: { token: 'any-token' } };
        const res = makeResponse();

        await deleteAccountConfirm(req as never, res);

        expect(mockRejectResponse).toHaveBeenCalledWith(res, 500, 'deleteAccountConfirm', []);
    });
});
