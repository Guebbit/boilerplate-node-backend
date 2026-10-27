/**
 * @module
 * `GET /account/export` controller — streams the caller's finished export to its owner. The page the
 * mailed link opens calls this with the visitor's own session; `requireFreshAuth` (mounted on the
 * route) is the identity proof, and the service's ownership query is the authorization.
 */

import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { openOwnExport } from '../services/export';

/**
 * GET /account/export — the caller's own export as a JSON attachment, or `404`. An account has
 * one live export, so there is no id to name.
 *
 * Streamed, never read into memory: the file is whatever the build wrote, and that is the whole
 * reason the build is a job. Not wrapped in the response envelope: the body IS the document
 * `AccountExportResponse` describes, so a saved file is the export and nothing else.
 */
export const getAccountExport = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id: userId } = request.authContext!;

    return openOwnExport(userId, callerContextOf(request))
        .then((opened) => {
            if (!opened) {
                rejectResponse(response, 404, [t('account.export.not-found')]);
                return undefined;
            }

            // Express: `attachment(name)` sets `Content-Disposition: attachment; filename=…` (RFC 6266,
            // encoded by the `content-disposition` package). The server owns the download's name.
            response.attachment(`account-export-${opened.requestedDay}.json`);
            response
                .status(200)
                .setHeader('Content-Type', 'application/json; charset=utf-8')
                // A person's whole data — never a shared cache, never the browser's disk cache.
                .setHeader('Cache-Control', 'private, no-store');

            // Node: pipes with backpressure and destroys both ends on error. Rejects if either
            // side closes early (a client that hangs up mid-download).
            // https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
            return pipeline(opened.stream, response);
        })
        .catch((error: unknown) => {
            // Headers are out: there is no envelope left to send, only a connection to cut.
            if (response.headersSent) {
                logger.warn({ message: 'account export download aborted', error });
                response.destroy();
                return;
            }
            catchAs(response, 'getAccountExport')(error);
        });
};
