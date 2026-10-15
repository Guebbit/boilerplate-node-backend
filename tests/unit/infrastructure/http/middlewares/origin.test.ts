/**
 * `requireAllowedOrigin` — a request naming a foreign `Origin` is refused before anything runs; one
 * naming an allowed origin, or none at all (curl, a health check, a same-origin navigation), passes.
 */
import type { NextFunction, Request, Response } from 'express';
import { asStub } from '@tests/stub';
import { setEnvironment } from '@tests/environment';
import { requireAllowedOrigin } from '@infrastructure/http/middlewares/origin';
import { recordAudit, coreAuditActions } from '@infrastructure/observability/audit';

// Only the sink is replaced: what a refusal leaves behind is this suite's to pin.
jest.mock('@infrastructure/observability/audit', () => ({
    ...jest.requireActual('@infrastructure/observability/audit'),
    recordAudit: jest.fn()
}));
jest.mock('@infrastructure/http/request', () => ({
    callerContextOf: jest.fn(() => ({ requestId: 'request-1' }))
}));

/** Runs the guard against a request carrying `origin`, answering what the response and `next` saw. */
const run = (origin: string | undefined) => {
    const next = jest.fn();
    const response = asStub<Response>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn()
    });
    const request = asStub<Request>({
        get: (name: string) => (name === 'Origin' ? origin : undefined),
        path: '/account/refresh',
        method: 'POST'
    });

    requireAllowedOrigin(request, response, asStub<NextFunction>(next));

    return { next, response };
};

beforeEach(() => {
    jest.mocked(recordAudit).mockClear();
    setEnvironment({ NODE_CORS_ORIGIN: 'https://shop.example,https://admin.example' });
});

describe('requireAllowedOrigin', () => {
    it.each(['https://shop.example', 'https://admin.example'])('lets %s through', (origin) => {
        const { next } = run(origin);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('lets a request with no Origin through: it is not a browser cross-origin call', () => {
        expect(run(undefined).next).toHaveBeenCalledTimes(1);
    });

    it.each([
        'https://evil.example',
        'https://shop.example.evil.example',
        'http://shop.example',
        'null'
    ])('refuses %s with 403 and never calls next', (origin) => {
        const { next, response } = run(origin);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('leaves an audit row naming the route and the origin, and none for a pass', () => {
        run('https://shop.example');
        expect(recordAudit).not.toHaveBeenCalled();

        run('https://evil.example');

        expect(recordAudit).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                outcome: 'failure',
                metadata: {
                    reason: 'foreign_origin',
                    origin: 'https://evil.example',
                    route: '/account/refresh',
                    method: 'POST'
                }
            })
        );
    });

    it('caps what it logs of an origin the attacker wrote', () => {
        run(`https://${'a'.repeat(500)}.example`);

        const [, fields] = jest.mocked(recordAudit).mock.calls[0];
        expect((fields.metadata as { origin: string }).origin).toHaveLength(200);
    });

    it('allows the developer default while the list is unset', () => {
        setEnvironment({ NODE_CORS_ORIGIN: undefined });

        expect(run('http://localhost:8080').next).toHaveBeenCalledTimes(1);
        expect(run('http://localhost:9999').next).not.toHaveBeenCalled();
    });
});
