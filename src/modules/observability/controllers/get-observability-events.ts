/**
 * @module
 * Controller for `GET /observability/events`: opens the SSE stream and wires its permission
 * recheck to the same cookie that opened it. See `services/stream.ts` for the stream itself.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import { stillHoldsKeyViaCookie } from '@kernel/middlewares/authorizations';
import { readRefreshCookie } from '@kernel/cookies';
import { streamObservabilityMetrics } from '../services/stream';

/**
 * The one permission key every route in this module guards on. Exported from here, rather than
 * from `routes.ts`, because this handler is the one place that needs the key's VALUE — for the
 * recheck below — and not just a guard built from it.
 */
export const OBSERVABILITY_READ_KEY = 'platform.observability.any.read';

/**
 * GET /observability/events
 *
 * Re-checks the permission every 30 seconds for as long as the stream stays open — the one place
 * in this codebase where a revoked caller does not lose access on their very next request, because
 * there is no next request until this recheck ends the stream. See `stillHoldsKeyViaCookie` and
 * `streamObservabilityMetrics`.
 */
export const getObservabilityEvents = (request: Request, response: Response) => {
    // Guaranteed present and valid: `requirePermissionViaCookie` already required it to resolve a
    // key-holding caller, or this handler would never run.
    const refreshToken = readRefreshCookie(request)!;

    streamObservabilityMetrics(response, () =>
        stillHoldsKeyViaCookie(request, refreshToken, OBSERVABILITY_READ_KEY)
    );
};
