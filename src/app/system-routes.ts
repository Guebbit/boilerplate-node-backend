/**
 * @module
 * System-level routes that serve the process itself rather than a domain: the root ping, the
 * liveness (`/livez`) and readiness (`/readyz`) probes, and `security.txt`, mounted at `/` by
 * `app/routes.ts`. Kept out of `src/modules` because they belong to nobody's business logic.
 */

import { Router } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { buildSecurityTxt } from './security-txt';
import { isServerReady } from '@infrastructure/runtime/readiness';

/** This file's router, mounted at `/` by `app/routes.ts`. */
export const router = Router();

/**
 * Welcome / public ping — the client-facing one (the frontend's API-down banner calls it). Not an
 * orchestrator probe: `/livez` is liveness, `/readyz` readiness.
 */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});

/**
 * GET /livez — Kubernetes-style liveness probe: is the process up. No I/O and an empty body, like
 * `/readyz`. It never looks at a dependency, on purpose: a container HEALTHCHECK restarts (or, under
 * Swarm, replaces) on failure, and a restart does not bring a downed database back.
 * See docs/tools/health-checks.md.
 */
router.get('/livez', (_request, response) => {
    response.status(200).end();
});

/**
 * GET /readyz — Kubernetes-style readiness probe, for a load balancer's own probe. Empty body on purpose (see the contract): an
 * orchestrator's probe reads the status code, never JSON, and the ordinary envelope would cost a
 * body on the one endpoint polled every few seconds for the life of the container.
 */
router.get('/readyz', (_request, response) => {
    response.status(isServerReady() ? 200 : 503).end();
});

/**
 * GET /.well-known/security.txt — RFC 9116 disclosure contact. An Express route, never a static
 * file: `express.static` runs with `dotfiles: 'ignore'`, which 404s any `.well-known` path.
 * 404 until the deployment sets `NODE_SECURITY_CONTACT` and `NODE_SECURITY_EXPIRES`.
 */
router.get('/.well-known/security.txt', (_request, response, next) => {
    const body = buildSecurityTxt(process.env);
    // Falling through reaches the ordinary 404 envelope mounted after this router.
    if (body === undefined) {
        next();
        return;
    }
    response.type('text/plain; charset=utf-8').send(body);
});
