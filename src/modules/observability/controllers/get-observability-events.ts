/**
 * @module
 * Controller for `GET /observability/events`: opens the SSE stream and wires its permission
 * recheck to the same cookie that opened it. See `services/stream.ts` for the stream itself.
 *
 * @see docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import { stillHoldsRuleViaCookie } from '@kernel/middlewares/authorizations';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { observabilityService } from '../services';

/**
 * GET /observability/events
 *
 * Re-checks the permission every 30 seconds for as long as the stream stays open — the one place
 * in this codebase where a revoked caller does not lose access on their very next request, because
 * there is no next request until this recheck ends the stream. See `stillHoldsRuleViaCookie` and
 * `streamObservabilityMetrics`.
 */
export const getObservabilityEvents = (request: Request, response: Response) => {
    // `requirePermissionViaCookie` already resolved a rule-holding caller and left its recheck on
    // the request, or this handler would never run. Read without `!` (this route is not behind
    // `isAuth`); absent means fail closed.
    const user = request.authContext;
    if (!user) {
        rejectResponse(response, 401, [
            { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
        ]);
        return;
    }

    observabilityService.streamObservabilityMetrics(response, user.id, () =>
        stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')
    );
};
