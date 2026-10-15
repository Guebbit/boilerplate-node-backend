/**
 * @module
 * A guard for the endpoints a cookie alone authenticates: refresh, logout, and the SSE stream. A
 * browser sends `Origin` on every cross-origin request and on every POST, and cannot be told to
 * leave it out or to lie about it from a page, so a request naming an origin that is not the
 * frontend's was made by someone else's page. CORS stops that page READING the answer; this stops
 * the request from acting at all (OWASP CSRF Prevention Cheat Sheet, "verify the origin").
 *
 * A request with no `Origin` is not a browser's cross-origin call — curl, a health check, the
 * same-origin navigation — and passes, exactly as the CORS middleware lets it through.
 */

import type { Request, Response, NextFunction } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { callerContextOf } from '@infrastructure/http/request';
import { recordAudit, coreAuditActions } from '@infrastructure/observability/audit';
import { isAllowedOrigin } from '../origins';

/**
 * Refuse with 403 a request whose `Origin` is not on the allowlist.
 *
 * @param request - the incoming request
 * @param response - answered 403 when the origin is foreign
 * @param next - called when the origin is absent or allowed
 */
export const requireAllowedOrigin = (
    request: Request,
    response: Response,
    next: NextFunction
): void => {
    const origin = request.get('Origin');
    if (origin === undefined || isAllowedOrigin(origin)) {
        next();
        return;
    }
    // A foreign origin is someone else's page acting with the browser's cookie: leave a trail
    // (ASVS 5.0 V16.3.2). Capped, since the header is the attacker's to write.
    recordAudit(callerContextOf(request), {
        action: coreAuditActions.SECURITY_FORBIDDEN,
        actorUserId: 'anonymous',
        outcome: 'failure',
        metadata: {
            reason: 'foreign_origin',
            origin: origin.slice(0, 200),
            route: request.path,
            method: request.method
        }
    });
    rejectResponse(response, 403, [t('generic.error-forbidden')]);
};
