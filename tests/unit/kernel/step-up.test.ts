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
import { asCustomer, asAdmin } from '../../support/callers';
import { callerInScope } from '@kernel/permissions';
import type { AuthContext } from '@types';
import { requireFreshAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { withEnvironmentOverrides } from '@tests/environment';

const emitAuditEvent = jest.fn();

jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    return {
        ...actual,
        emitAuditEvent: (...args: unknown[]) => emitAuditEvent(...args),
        // `requirePermission`'s step-up path calls `recordAudit`, which closes over its own
        // module's real `emitAuditEvent` — immune to the override above. Reroute it through the
        // wrapped one so this file's assertions still see it.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

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

        requirePermission('delete', 'User')(
            makeRequest({ ...asAdmin('u1'), authTime: NOW() }),
            makeResponse(),
            asStub<NextFunction>(next)
        );

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('challenges a caller whose session is too old, with 401 rather than 403', () => {
        const response = makeResponse();
        const next = jest.fn();

        requirePermission('delete', 'User')(
            // Yesterday. `authTime` is carried from the token's own claim, never derived.
            makeRequest({ ...asAdmin('u1'), authTime: NOW() - 86_400 }),
            response,
            asStub<NextFunction>(next)
        );

        // 401 because the status names the client's next move, and "authenticate and try again"
        // is the literal definition of step-up.
        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('reads the tier window per request, so a changed setting moves the line', () =>
        withEnvironmentOverrides({ NODE_REAUTH_TIME_CRITICAL: '60' }, () => {
            const response = makeResponse();

            requirePermission('delete', 'User')(
                makeRequest({ ...asAdmin('u1'), authTime: NOW() - 61 }),
                response,
                asStub<NextFunction>(jest.fn())
            );

            expect(response.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    errors: [expect.objectContaining({ details: { maxAge: 60 } })]
                })
            );

            return Promise.resolve();
        }));

    it('carries both dialects of the challenge', () => {
        const response = makeResponse();

        requirePermission('delete', 'User')(
            makeRequest({ ...asAdmin('u1'), authTime: 0 }),
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
        requirePermission('delete', 'User')(
            makeRequest({ ...asAdmin('u1'), authTime: 0 }),
            makeResponse(),
            asStub<NextFunction>(jest.fn())
        );

        expect(emitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'security.reauth_required',
                outcome: 'failure',
                metadata: expect.objectContaining({
                    permission: 'delete:User',
                    tier: 'critical'
                })
            })
        );
    });

    it('refuses a caller without the key rather than challenging them', () => {
        const response = makeResponse();

        requirePermission('delete', 'User')(
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

        requirePermission('update', 'User')(
            makeRequest({ ...asAdmin('u1'), authTime: 0 }),
            makeResponse(),
            asStub<NextFunction>(next)
        );

        // A challenge people learn to dismiss protects nothing, which is why almost no key
        // carries one.
        expect(next).toHaveBeenCalledTimes(1);
    });
});

/** The first audited row's reason, or `undefined` when nothing was audited. */
const auditedReason = (): unknown =>
    (emitAuditEvent.mock.calls[0]?.[0] as { metadata?: { reason?: unknown } } | undefined)?.metadata
        ?.reason;

describe('requireFreshAuth with no session on the request', () => {
    it('refuses an API key as forbidden and audits why, since a key cannot step up', () => {
        const response = makeResponse();
        const next = jest.fn();

        requireFreshAuth('critical')(
            asStub<Request>({
                caller: callerInScope(asAdmin('u1'), 'tenant'),
                credentialId: 'key-1',
                path: '/users/u1',
                method: 'PUT',
                headers: {}
            }),
            response,
            asStub<NextFunction>(next)
        );

        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json.mock.calls[0]?.[0]).toMatchObject({
            errors: [{ code: 'FORBIDDEN' }]
        });
        expect(auditedReason()).toBe('credential_cannot_step_up');
        expect(next).not.toHaveBeenCalled();
    });

    it('answers a request with no caller at all 401 and audits it as unauthenticated', () => {
        const response = makeResponse();
        const next = jest.fn();

        requireFreshAuth('critical')(
            asStub<Request>({ path: '/users/u1', method: 'PUT', headers: {} }),
            response,
            asStub<NextFunction>(next)
        );

        expect(response.status).toHaveBeenCalledWith(401);
        expect(emitAuditEvent).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});
