/**
 * Observability attachment — `src/infrastructure/http/middlewares/observability.ts`.
 *
 * Small, but it is the seam the whole audit/analytics story hangs on: controllers call
 * `request.obs.audit()` instead of importing the emitter singleton, which is what makes those
 * calls injectable in tests. If the middleware stopped attaching the context, every controller
 * that audits would throw on `undefined`, and if it stopped calling `next()` every request would
 * hang — two failures with no partial mode in between.
 */

import type { Request, Response, NextFunction } from 'express';
import { attachObservability } from '@infrastructure/http/middlewares/observability';
import { defaultObservabilityContext } from '@infrastructure/observability/context';

describe('attachObservability', () => {
    it('attaches the default observability context to the request', () => {
        const request = {} as Request;

        attachObservability(request, {} as Response, jest.fn());

        expect(request.obs).toBe(defaultObservabilityContext);
    });

    it('exposes callable audit and analytics entry points', () => {
        // Controllers depend on exactly these two names; a context missing either would only
        // fail at the moment something is audited, which may be a rare path.
        const request = {} as Request;

        attachObservability(request, {} as Response, jest.fn());

        expect(typeof request.obs!.audit).toBe('function');
        expect(typeof request.obs!.analytics).toBe('function');
    });

    it('calls next exactly once so the request continues', () => {
        const next = jest.fn() as unknown as NextFunction;

        attachObservability({} as Request, {} as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not touch the response', () => {
        const response = { status: jest.fn(), json: jest.fn(), send: jest.fn() };

        attachObservability({} as Request, response as unknown as Response, jest.fn());

        expect(response.status).not.toHaveBeenCalled();
        expect(response.json).not.toHaveBeenCalled();
        expect(response.send).not.toHaveBeenCalled();
    });
});
