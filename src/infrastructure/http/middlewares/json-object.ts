/**
 * @module
 * The shape guard for JSON bodies: a body that parsed but is not a JSON object is a 422.
 *
 * Why:     `express.json` runs non-strict (any JSON value parses, RFC 8259 §2), so `5`, `"x"`,
 *          `true`, `null` and `[]` reach the routes. Every body this API declares is an object, and
 *          the body readers turn anything else into `{}`: a scalar PATCH would be a 200 no-op and a
 *          scalar search an unfiltered list.
 * Status:  422, not 400 (RFC 5789 §2.2): the JSON is well-formed, the document is unprocessable.
 *          Unparseable JSON stays the parser's 400.
 * Scope:   JSON only; a body no parser read is `undefined` and passes. Raw-body (webhook) paths are
 *          skipped by the mount in `app/security.ts`, which knows them.
 *
 * See: docs/understand/request-flow.md
 */

import type { NextFunction, Request, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { JSON_BODY_TYPES } from '@infrastructure/http/middlewares/json-depth';
import { isPlainObject } from '@infrastructure/object-guards';
import { t } from '@infrastructure/i18n';
import { ERROR_CODES } from '@api/error-codes';

/**
 * Express middleware: refuse a parsed JSON body that is not a plain object.
 *
 * @param request - the incoming request, its body already parsed
 * @param response - answered with 422 `VALIDATION_ERROR` when the body is not an object
 * @param next - called for every other request
 */
export const requireJsonObjectBody = (request: Request, response: Response, next: NextFunction) => {
    // `request.is`: false when there is no body or it is another media type. Nothing to judge then.
    if (request.is(JSON_BODY_TYPES) && request.body !== undefined && !isPlainObject(request.body))
        return rejectResponse(response, 422, [
            {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: t('generic.error-body-not-object')
            }
        ]);

    next();
};
