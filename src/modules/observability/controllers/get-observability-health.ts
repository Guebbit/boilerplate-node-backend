/**
 * @module
 * Controller for `GET /observability/health`. The readiness payload itself is built by
 * `services/health.ts`; this file only calls it and shapes the response. See the JSDoc on
 * `getObservabilityHealth` below for why liveness lives elsewhere.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import type { ObservabilityHealth } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { buildObservabilityHealth } from '../services/health';

/**
 * GET /observability/health
 *
 * The READINESS answer: can this instance serve what it promises, and if not, which part is
 * missing. Liveness — is the process alive at all — is `GET /`, and it is what the container
 * HEALTHCHECK probes; the two are deliberately different endpoints, because an orchestrator
 * restarts on liveness and restarting this process would not bring a downed Redis back.
 */
export const getObservabilityHealth = (_request: Request, response: Response) =>
    buildObservabilityHealth()
        .then((health) => {
            successResponse<ObservabilityHealth>(response, health);
        })
        .catch(catchAs(response, 'getObservabilityHealth'));
