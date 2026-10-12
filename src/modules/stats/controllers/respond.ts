/**
 * @module
 * The one handler shape every stats read shares: read the query, check it, resolve the period
 * against the shop's zone, run the composer, answer. Only the schema and the composer differ.
 */

import type { Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { readInput } from '@infrastructure/http/request';
import { blankToUndefined } from '@infrastructure/http/schemas';
import { catchAs, namedHandler, parseBody } from '@infrastructure/http/controller';
import { t } from '@infrastructure/i18n';
import { resolvePeriod, type Period } from '../services/range';

/** The period every read takes: two shop-local days, and optionally the bucket size. */
export const periodFields = {
    from: z.string().min(1),
    to: z.string().min(1)
};

/** `interval` as a query string carries it: blank is absent. */
export const intervalField = z.preprocess(
    blankToUndefined,
    z.enum(['day', 'week', 'month']).optional()
);

/**
 * Build a stats handler.
 *
 * @param name - the operation, for the log line and the module's surface table
 * @param schema - the validated query; must carry `from` and `to`
 * @param run - the composer, given the resolved period and the validated query
 */
export const statsHandler = <
    TSchema extends ZodType<{
        from: string;
        to: string;
        interval?: 'day' | 'week' | 'month' | undefined;
    }>
>(
    name: string,
    schema: TSchema,
    run: (period: Period, query: TSchema['_output'], request: Request) => Promise<unknown>
) =>
    namedHandler(name, (request: Request, response: Response) => {
        // readInput, `search` surface: the query as the lists read it.
        const query = parseBody(schema, readInput(request, { surface: 'search' }), response);
        if (!query) return undefined;

        const resolved = resolvePeriod(query);
        if ('refusal' in resolved) {
            rejectResponse(response, 422, [t(`stats.range.${resolved.refusal}`)]);
            return undefined;
        }

        return run(resolved.period, query, request)
            .then((data) => {
                successResponse(response, data);
            })
            .catch(catchAs(response, name));
    });
