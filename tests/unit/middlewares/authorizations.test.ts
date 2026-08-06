/**
 * Authorization middlewares — `src/middlewares/authorizations.ts`.
 *
 * Three middlewares with deliberately different failure modes, and the difference is the point:
 *
 *   `getAuth`  — *optional* identification. Fails open by design: a bad token means "anonymous",
 *                not "rejected", because it also guards public routes. It must always call
 *                `next()` exactly once, on every path, or the request hangs.
 *   `isAuth`   — *required* identification. Fails closed with 401.
 *   `isAdmin`  — *required* elevation. Fails closed with 403, and distinguishes "not logged in"
 *                from "logged in but not an admin" in the audit trail.
 *
 * The response layer is real (not mocked) so the asserted status codes are the ones a client
 * actually receives; only the audit sink and the JWT/DB boundaries are stubbed.
 */

import type { Request, Response, NextFunction } from 'express';
import { getTokenBearer, getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { verifyAccessToken } from '@middlewares/auth-jwt';
import { userRepository } from '@repositories/users';
import { emitAuditEvent, AuditAction } from '@core/observability/audit';

jest.mock('@middlewares/auth-jwt', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    verifyAccessToken: jest.fn()
}));

jest.mock('@repositories/users', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    userRepository: { findById: jest.fn() }
}));

// Only the sink is replaced; `buildAuditEvent` and the `AuditAction` vocabulary stay real, so an
// event that stops matching the real builder's shape fails here rather than in production.
jest.mock('@core/observability/audit', () => ({
    ...jest.requireActual('@core/observability/audit'),
    emitAuditEvent: jest.fn()
}));

const mockedVerifyAccessToken = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const mockedFindById = userRepository.findById as jest.MockedFunction<
    typeof userRepository.findById
>;
const mockedEmitAuditEvent = emitAuditEvent as jest.MockedFunction<typeof emitAuditEvent>;

/** Request stub carrying an optional Authorization header and auth context. */
const makeRequest = (options: { authorization?: string; authContext?: unknown } = {}) =>
    ({
        header: jest.fn((name: string) =>
            name === 'Authorization' ? options.authorization : undefined
        ),
        authContext: options.authContext,
        path: '/protected',
        method: 'GET',
        headers: {}
    }) as unknown as Request;

/** Response stub with a chainable status().json(), capturing the real envelope. */
const makeResponse = () => {
    const response = {
        status: jest.fn(),
        json: jest.fn()
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
};

/** Runs an async middleware and resolves once it has called `next()`. */
const runUntilNext = async (
    middleware: (request: Request, response: Response, next: NextFunction) => void,
    request: Request,
    response: Response
) => {
    const next = jest.fn();
    const called = new Promise<void>((resolve) => {
        next.mockImplementation(() => resolve());
    });
    middleware(request, response, next as unknown as NextFunction);
    await called;
    return next;
};

describe('getTokenBearer', () => {
    it('strips the Bearer prefix and returns the token', () => {
        expect(getTokenBearer(makeRequest({ authorization: 'Bearer abc.def.ghi' }))).toBe(
            'abc.def.ghi'
        );
    });

    it('returns undefined when the header is absent', () => {
        expect(getTokenBearer(makeRequest())).toBeUndefined();
    });

    it('returns undefined when the header has a scheme but no token', () => {
        // 'Bearer'.split(' ')[1] is undefined — the caller's falsy check must still catch it.
        expect(getTokenBearer(makeRequest({ authorization: 'Bearer' }))).toBeUndefined();
    });
});

describe('getAuth', () => {
    it('calls next without an auth context when no token is present', async () => {
        const request = makeRequest();

        const next = await runUntilNext(getAuth, request, makeResponse());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
        // The JWT boundary must not even be reached — verifying an absent token would be work
        // done to produce a guaranteed failure.
        expect(mockedVerifyAccessToken).not.toHaveBeenCalled();
    });

    it('attaches the identity of the user the token names', async () => {
        mockedVerifyAccessToken.mockResolvedValue({ id: 'user-1' });
        mockedFindById.mockResolvedValue({
            id: 'user-1',
            email: 'user@example.com',
            username: 'tester',
            admin: true,
            imageUrl: '/images/a.png'
        } as never);

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        await runUntilNext(getAuth, request, makeResponse());

        expect(request.authContext).toEqual({
            id: 'user-1',
            email: 'user@example.com',
            username: 'tester',
            admin: true,
            imageUrl: '/images/a.png'
        });
    });

    it('resolves a missing admin flag to false rather than undefined', async () => {
        // `admin ?? false`. An undefined `admin` would be falsy at most call sites and so would
        // "work", but `isAdmin` and `userScope` both branch on it — an explicit false is the
        // only value that cannot be misread as "unknown".
        mockedVerifyAccessToken.mockResolvedValue({ id: 'user-2' });
        mockedFindById.mockResolvedValue({
            id: 'user-2',
            email: 'plain@example.com',
            username: 'plain'
        } as never);

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        await runUntilNext(getAuth, request, makeResponse());

        expect(request.authContext?.admin).toBe(false);
    });

    it('proceeds anonymously when the token is invalid or expired', async () => {
        // Fails open on purpose: this middleware also runs on public routes, where a stale token
        // in a browser must not turn a public page into an error.
        mockedVerifyAccessToken.mockRejectedValue(new Error('jwt expired'));

        const request = makeRequest({ authorization: 'Bearer expired.token' });
        const next = await runUntilNext(getAuth, request, makeResponse());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
    });

    it('proceeds anonymously when the token is valid but the user no longer exists', async () => {
        // A deleted account holding a still-valid JWT must not be granted an identity.
        mockedVerifyAccessToken.mockResolvedValue({ id: 'ghost' });
        // eslint-disable-next-line unicorn/no-null -- the repository really resolves null
        mockedFindById.mockResolvedValue(null as never);

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        const next = await runUntilNext(getAuth, request, makeResponse());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
    });

    it('proceeds anonymously when the user lookup itself fails', async () => {
        mockedVerifyAccessToken.mockResolvedValue({ id: 'user-3' });
        mockedFindById.mockRejectedValue(new Error('database unavailable'));

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        const next = await runUntilNext(getAuth, request, makeResponse());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
    });

    it('never sends a response of its own', async () => {
        // It identifies; it does not authorize. Any status set here would pre-empt the route.
        mockedVerifyAccessToken.mockRejectedValue(new Error('nope'));
        const response = makeResponse();

        await runUntilNext(getAuth, makeRequest({ authorization: 'Bearer x' }), response);

        expect(response.status).not.toHaveBeenCalled();
        expect(response.json).not.toHaveBeenCalled();
    });
});

describe('isAuth', () => {
    it('passes through when both an auth context and a token are present', () => {
        const next = jest.fn();
        const response = makeResponse();

        isAuth(
            makeRequest({ authorization: 'Bearer valid.token', authContext: { id: 'user-1' } }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects with 401 when there is no auth context', () => {
        const next = jest.fn();
        const response = makeResponse();

        isAuth(makeRequest({ authorization: 'Bearer stale.token' }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, status: 401 })
        );
    });

    it('rejects with 401 when a context exists but the bearer token is gone', () => {
        // Both conditions are required. Accepting a context without its token would let a
        // previously-populated request object stand in for a credential.
        const next = jest.fn();
        const response = makeResponse();

        isAuth(makeRequest({ authContext: { id: 'user-1' } }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('records an anonymous unauthorized audit event on rejection', () => {
        isAuth(makeRequest(), makeResponse(), jest.fn());

        expect(mockedEmitAuditEvent).toHaveBeenCalledTimes(1);
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: AuditAction.SECURITY_UNAUTHORIZED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure'
            })
        );
    });

    it('records nothing when the request is allowed through', () => {
        isAuth(
            makeRequest({ authorization: 'Bearer valid.token', authContext: { id: 'user-1' } }),
            makeResponse(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });
});

describe('isAdmin', () => {
    it('passes an admin through', () => {
        const next = jest.fn();
        const response = makeResponse();

        isAdmin(makeRequest({ authContext: { id: 'user-1', admin: true } }), response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects an authenticated non-admin with 403', () => {
        const next = jest.fn();
        const response = makeResponse();

        isAdmin(makeRequest({ authContext: { id: 'user-1', admin: false } }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('rejects a caller whose admin flag is absent', () => {
        // Absent must mean "not an admin". The fail-safe direction, asserted separately from the
        // explicit-false case because they take different code paths.
        const next = jest.fn();
        const response = makeResponse();

        isAdmin(makeRequest({ authContext: { id: 'user-1' } }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('answers 403, not 401, for an unauthenticated caller', () => {
        // Deliberate: this middleware runs after `isAuth`, so reaching it without a context is a
        // routing mistake rather than a missing credential, and 401 would invite a pointless
        // re-login attempt.
        const next = jest.fn();
        const response = makeResponse();

        isAdmin(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('distinguishes not-authenticated from not-admin in the audit trail', () => {
        isAdmin(makeRequest(), makeResponse(), jest.fn());

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: AuditAction.SECURITY_FORBIDDEN,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                metadata: expect.objectContaining({ reason: 'not_authenticated' })
            })
        );
    });

    it('attributes a not-admin denial to the actual user, not to anonymous', () => {
        // The whole value of the audit record: "who tried". Falling back to 'anonymous' here
        // would erase the identity of a real user probing admin routes.
        isAdmin(
            makeRequest({ authContext: { id: 'user-9', admin: false } }),
            makeResponse(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: AuditAction.SECURITY_FORBIDDEN,
                actor_user_id: 'user-9',
                metadata: expect.objectContaining({ reason: 'not_admin' })
            })
        );
    });

    it('sends distinct messages for the two denial reasons', () => {
        const unauthenticated = makeResponse();
        isAdmin(makeRequest(), unauthenticated, jest.fn());

        const nonAdmin = makeResponse();
        isAdmin(makeRequest({ authContext: { id: 'user-9', admin: false } }), nonAdmin, jest.fn());

        const unauthenticatedBody = unauthenticated.json.mock.calls[0][0];
        const nonAdminBody = nonAdmin.json.mock.calls[0][0];
        expect(unauthenticatedBody.message).not.toBe(nonAdminBody.message);
    });
});
