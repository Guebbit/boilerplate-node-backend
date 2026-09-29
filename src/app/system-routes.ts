/**
 * @module
 * System-level routes that serve the process itself rather than a domain: the root ping and the
 * readiness probe and `security.txt`, mounted at `/` by `app/routes.ts`. Kept out of `src/modules` because they
 * belong to nobody's business logic.
 */

import { Router } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { buildSecurityTxt } from './security-txt';
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
