/**
 * @module
 * The 415 guard: a write body in a media type the operation does not declare is refused.
 *
 * Why it exists: `express.json` only parses the types it is told to. Any other body arrives as
 * `{}`, and an all-optional PATCH schema accepts `{}` — a 200 that changed nothing.
 * RFC 9110 §15.5.16 names the honest answer.
 *
 * See: docs/api/write-methods.md#patch--json-merge-patch
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { ERROR_CODES } from '@api/error-codes';
import type { RequestContentType } from '@api/request-content-types';

/**
 * Whether the request sends bytes. type-is's own check counts `Content-Length: 0` as a body,
 * which would 415 every action POST a client sends with a content type and nothing in it.
 *
 * @param request - the incoming request
 * @returns `true` for a chunked body or a non-zero `Content-Length`
 */
const carriesBody = (request: Request): boolean =>
    request.headers['transfer-encoding'] !== undefined ||
    Number(request.headers['content-length'] ?? 0) > 0;

/**
 * Whether the request's body type is one the operation declares.
 *
 * @param request - the incoming request, known to carry a body
 * @param types - the declared media types; empty when the operation takes no body
 * @returns `false` for any body on a body-less operation, else type-is's verdict
 */
const acceptsBody = (request: Request, types: readonly string[]): boolean =>
    types.length > 0 && request.is([...types]) !== false;

/**
 * Builds the guard from the generated operation table.
 *
 * Only a request that carries a body is judged: an action POST with no body has nothing to
 * misinterpret, and a missing required body is the schema's own 422. A route the table does not
 * know is left alone.
 *
 * @param operations - the operations that declare a request body, most specific first (the
 *   generator orders them: static segments before parameters, so `/products/search` never reads
 *   as `/products/{id}`)
 * @returns express middleware answering 415 for an undeclared type
 */
export const requireDeclaredContentType = (
    operations: readonly RequestContentType[]
): RequestHandler => {
    return (request: Request, response: Response, next: NextFunction) => {
        const path = request.path.length > 1 ? request.path.replace(/\/$/, '') : request.path;
        const operation = operations.find(
            (candidate) => candidate.method === request.method && candidate.pattern.test(path)
        );

        // `request.is` (type-is): `false` when the type is not listed. An empty list means the
        // operation takes no body at all, and `request.is([])` would answer with the request's own
        // type instead of `false`, so that case is decided here.
        if (operation && carriesBody(request) && !acceptsBody(request, operation.types))
            return rejectResponse(response, 415, [
                {
                    code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
                    message: t('generic.error-unsupported-media-type'),
                    details: { accepted: [...operation.types] }
                }
            ]);

        next();
    };
};
