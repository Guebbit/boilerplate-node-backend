/**
 * @module
 * GET /orders/export — the list's filters, answered as a CSV file. Streamed, never read into
 * memory: the response is the cursor. Reached only through `export:Order` (itself step-up
 * gated) and the export's own rate budget, both mounted on the route.
 */

import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, namedHandler, parseBody } from '@infrastructure/http/controller';
import { mergedSearchInput } from '@infrastructure/surfaces/create-search-controller';
import { orderService } from '../services';
import { honourUserIdFilter, searchOrdersQuerySchema } from './get-orders';

/** The list's own query, minus the paging a file has none of. */
const exportOrdersQuerySchema = searchOrdersQuerySchema.omit({ page: true, pageSize: true });

/**
 * GET /orders/export — `text/csv`, `Cache-Control: private, no-store` (the file is every
 * customer's email: never a shared cache, never the browser's disk cache — ASVS 14.3.2).
 *
 * A request over the row cap answers 422 before a header is sent; once the CSV has started, a
 * failure can only cut the connection, since no envelope is left to send.
 */
export const getOrdersExport = namedHandler(
    'getOrdersExport',
    (request: Request, response: Response): Promise<void> | void => {
        const parsed = parseBody(
            exportOrdersQuerySchema,
            mergedSearchInput(request, honourUserIdFilter),
            response
        );
        if (!parsed) return;

        return orderService
            .openOrderExport(parsed, request.authContext, callerContextOf(request))
            .then((opened) => {
                if ('success' in opened) {
                    rejectResponse(response, opened.status, opened.errors);
                    return undefined;
                }

                response
                    .status(200)
                    .setHeader('Content-Type', 'text/csv; charset=utf-8')
                    .setHeader('Content-Disposition', 'attachment; filename="orders.csv"')
                    .setHeader('Cache-Control', 'private, no-store');

                // Node: pipes with backpressure and destroys every stream on error. Rejects if
                // either end closes early (a client that hangs up mid-download).
                // https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
                return pipeline(opened.source, opened.csv, response);
            })
            .catch((error: unknown) => {
                // Headers are out: there is no envelope left to send, only a connection to cut.
                if (response.headersSent) {
                    logger.warn({ message: 'orders export aborted', error });
                    response.destroy();
                    return;
                }
                catchAs(response, 'getOrdersExport')(error);
            });
    }
);
