/**
 * @module
 * Step-up, demanded by the KEY rather than by the route — `requirePermission` reading `stepUp`
 * off `shared/authorization-keys.yaml`.
 *
 * Two properties are worth asserting and neither is obvious from the code:
 *
 *   1. **Refused before challenged.** A caller who could never take the action is told no, not
 *      told to re-authenticate — the second answer hands them a fact about the permission model
 *      they had not earned.
 *   2. **The demand is audited.** "We asked" is the half of step-up nobody can reconstruct
 *      afterwards: the retry that follows looks like an ordinary success, and a challenge nobody
 *      logged is a control nobody can show was applied.
 */

import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { asCustomer, asOwner } from '../../support/callers';
import { callerInScope } from '@kernel/permissions';
import type { AuthContext } from '@types';
import { requirePermission } from '@kernel/middlewares/authorizations';

const emitAuditEvent = jest.fn();

jest.mock('@infrastructure/observability/audit', () => ({
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: (...args: unknown[]) => emitAuditEvent(...args)
}));

const NOW = () => Math.floor(Date.now() / 1000);

const makeRequest = (context: AuthContext) =>
    asStub<Request>({
        authContext: context,
        caller: callerInScope(context, 'tenant'),
        path: '/users/u1',
        method: 'DELETE',
        headers: {}
    });

const makeResponse = () => {
    const response = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);

    return asStub<Response>(response) as Response & typeof response;
};

beforeEach(() => emitAuditEvent.mockClear());

describe('a key that demands step-up', () => {
    it('lets a freshly proved caller through', () => {
        const next = jest.fn();

        requirePermission('users.delete')(
            makeRequest({ ...asOwner('u1'), authTime: NOW() }),
            makeResponse(),
            asStub<NextFunction>(next)
        );

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('challenges a caller whose session is too old, with 401 rather than 403', () => {
        const response = makeResponse();
        const next = jest.fn();

        requirePermission('users.delete')(
            // Yesterday. `authTime` is carried from the token's own claim, never derived.
            makeRequest({ ...asOwner('u1'), authTime: NOW() - 86_400 }),
            response,
            asStub<NextFunction>(next)
        );

        // 401 because the status names the client's next move, and "authenticate and try again"
        // is the literal definition of step-up.
        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('carries both dialects of the challenge', () => {
        const response = makeResponse();

        requirePermission('users.delete')(
            makeRequest({ ...asOwner('u1'), authTime: 0 }),
            response,
            asStub<NextFunction>(jest.fn())
        );

        // The header for anything that speaks OAuth; the envelope code for this app's own clients,
        // which read `errors[].code` and never the header.
        expect(response.setHeader).toHaveBeenCalledWith(
            'WWW-Authenticate',
            expect.stringContaining('insufficient_user_authentication')
        );
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: expect.arrayContaining([
                    expect.objectContaining({ code: 'REAUTH_REQUIRED' })
                ])
            })
        );
    });

    it('records that the challenge was demanded, and for which key', () => {
        requirePermission('users.delete')(
            makeRequest({ ...asOwner('u1'), authTime: 0 }),
            makeResponse(),
            asStub<NextFunction>(jest.fn())
        );

        expect(emitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'security.reauth_required',
                outcome: 'failure',
                metadata: expect.objectContaining({
                    permission: 'users.delete',
                    tier: 'critical'
                })
            })
        );
    });

    it('refuses a caller without the key rather than challenging them', () => {
        const response = makeResponse();

        requirePermission('users.delete')(
            makeRequest({ ...asCustomer('u1'), authTime: 0 }),
            response,
            asStub<NextFunction>(jest.fn())
        );

        // 403, not 401. Telling somebody to re-authenticate for an action they could never take
        // either way hands them a fact about the model they had not earned.
        expect(response.status).toHaveBeenCalledWith(403);
        expect(emitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'security.forbidden' })
        );
    });
});

describe('a key that does not demand step-up', () => {
    it('lets an ancient session through', () => {
        const next = jest.fn();

        requirePermission('users.update')(
            makeRequest({ ...asOwner('u1'), authTime: 0 }),
            makeResponse(),
            asStub<NextFunction>(next)
        );

        // A challenge people learn to dismiss protects nothing, which is why almost no key
        // carries one.
        expect(next).toHaveBeenCalledTimes(1);
    });
});
