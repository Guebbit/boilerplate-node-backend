import type { NextFunction, Request, Response } from 'express';
import { defaultObservabilityContext } from '@utils/observability-context';

/**
 * Attaches the default observability context to every request.
 * Controllers use request.obs.audit() / request.obs.analytics() instead of
 * importing singletons directly, enabling easy test injection.
 */
export const attachObservability = (
    request: Request,
    _response: Response,
    next: NextFunction
): void => {
    request.obs = defaultObservabilityContext;
    next();
};
