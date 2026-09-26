/**
 * @module
 * System-level routes that serve the process itself rather than a domain: the root ping and the
 * readiness probe, mounted at `/` by `app/routes.ts`. Kept out of `src/modules` because they
 * belong to nobody's business logic.
 */

import { Router } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { isServerReady } from '@infrastructure/runtime/readiness';

/** This file's router, mounted at `/` by `app/routes.ts`. */
export const router = Router();

/** Welcome / public ping — returns 200 if the process is running. */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});

/**
 * GET /readyz — Kubernetes-style readiness probe. Empty body on purpose (see the contract): an
 * orchestrator's probe reads the status code, never JSON, and the ordinary envelope would cost a
 * body on the one endpoint polled every few seconds for the life of the container.
 */
router.get('/readyz', (_request, response) => {
    response.status(isServerReady() ? 200 : 503).end();
});
